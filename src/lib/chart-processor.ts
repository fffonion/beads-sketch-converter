import QRCode from "qrcode";
import {
  detectAutoRasterWithWasm,
  detectChartBoardWithWasm,
  enhanceEdgesWithFftWasm,
  type WasmAutoDetection,
} from "./detecter";
import { createEmbeddedChartQrDataUrl } from "./chart-qr";
import {
  CHART_METADATA_APP,
  CHART_METADATA_VERSION,
  defaultOutputName,
  embedChartMetadataInPngBlob,
  isPngLikeFile,
  readEmbeddedChartMetadataFromFile,
  type EmbeddedChartMetadata,
} from "./chart-png";
import {
  buildChartShareUrl,
  ChartSerializationError,
  serializeChartPayload,
} from "./chart-serialization";
import { drawBrandWordmark, measureBrandWordmarkWidth } from "./brand-wordmark";
import { sharedColorSystemById, sharedColorSystemDefinitions } from "./color-system-data";
import { getPindouBoardThemeShades, type PindouBoardTheme } from "./pindou-board-theme";

const GRID_SEPARATOR_COLOR = "#C9C4BC";
const BOARD_FRAME_COLOR = "#111111";
const CANVAS_BACKGROUND = "#F7F4EE";
const OMITTED_BACKGROUND_HEX = "#FFFFFF";
const MAX_DETECTION_EDGE = 768;
const CHART_EDGE_SAMPLE_PROGRESS = [0.15, 0.2, 0.3, 0.35];
const CHART_EDGE_SAMPLE_INSET = 0.18;
const MIN_VISIBLE_PIXEL_ALPHA = 8;
const MIN_MATCHABLE_CELL_ALPHA = 32;
const GRAYSCALE_CURVE_BLEND = 0.55;
const SNS_MAX_EXPORT_WIDTH = 1280;
const SNS_MAX_EXPORT_HEIGHT = 1468;
const MIN_SNS_DISPLAY_QR_SIZE = 192;

type CropBox = [number, number, number, number];
type Rgb = [number, number, number];
type Oklab = [number, number, number];
type SamplingStrategy = "patch" | "chart-edge";

export interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const embeddedChartResultCache = new WeakMap<File, Promise<ProcessResult | null>>();
const rasterCache = new WeakMap<File, Promise<RasterImage>>();
const croppedRasterCache = new WeakMap<RasterImage, Map<string, RasterImage>>();
const autoDetectionCache = new WeakMap<RasterImage, Promise<WasmAutoDetection | null>>();
const logicalGridCache = new WeakMap<RasterImage, Map<string, Promise<RasterImage>>>();

interface PaletteColor {
  label: string;
  hex: string;
  rgb: Rgb;
  oklab: Oklab;
}

export interface ColorSystemOption {
  id: string;
  label: string;
}

export interface ProcessOptions {
  colorSystemId?: string;
  grayscaleMode?: boolean;
  gridMode: "auto" | "manual";
  gridWidth?: number;
  gridHeight?: number;
  cropRect?: NormalizedCropRect | null;
  contrast?: number;
  renderStyleBias?: number;
  reduceColors: boolean;
  applyAutoReduceColorsDefault?: boolean;
  reduceTolerance: number;
  preSharpen: boolean;
  preSharpenStrength: number;
  applyAutoFftEdgeEnhanceDefault?: boolean;
  fftEdgeEnhance?: boolean;
  fftEdgeEnhanceStrength?: number;
  fftEdgeEnhanceOverrideLabel?: string | null;
  cellSize?: number;
  messages?: ProcessMessages;
}

export interface NormalizedCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProcessMessages {
  nonPixelArtError: string;
  manualGridRequired: string;
  canvasContextUnavailable: string;
  encodingFailed: string;
  chartSerializationTooManyColors: string;
  chartQrTooLarge: string;
  chartQrCaption: string;
  chartTitle: (width: number, height: number) => string;
  chartMetaLine: (colorSystemLabel: string, totalBeads: number) => string;
}

export interface ChartExportSettings {
  chartTitle?: string;
  watermarkText?: string;
  watermarkImageDataUrl?: string | null;
  saveMetadata?: boolean;
  lockEditing?: boolean;
  includeGuides?: boolean;
  showColorLabels?: boolean;
  gaplessCells?: boolean;
  includeBoardPattern?: boolean;
  boardTheme?: PindouBoardTheme;
  includeLegend?: boolean;
  includeQrCode?: boolean;
  shareUrl?: string | null;
}

export interface ReduceColorsOptions {
  preserveEdges?: boolean;
}

export interface ColorCount {
  label: string;
  count: number;
  hex: string;
}

export interface EditableCell {
  label: string | null;
  hex: string | null;
  source?: "detected" | "manual" | null;
}

interface CellTone {
  rgb: Rgb;
  luma: number;
}

interface OutlineBridgeCandidate {
  support: number;
  index: number;
  luma: number;
  cell: EditableCell;
  mode: "horizontal" | "vertical" | "diag-desc" | "diag-asc";
}

interface RepresentativePixel {
  rgb: Rgb;
  alpha: number;
}

export interface PaletteOption {
  label: string;
  hex: string;
}

export interface ProcessResult {
  blob: Blob;
  fileName: string;
  colorSystemId: string;
  chartTitle?: string;
  detectionMode: string;
  effectiveReduceColors: boolean;
  effectiveFftEdgeEnhance: boolean;
  preferredEditorMode: "edit" | "pindou";
  editingLocked: boolean;
  detectedCropRect: NormalizedCropRect | null;
  gridWidth: number;
  gridHeight: number;
  originalUniqueColors: number;
  reducedUniqueColors: number;
  paletteColorsUsed: number;
  colors: ColorCount[];
  cells: EditableCell[];
}

export interface ChartQrBoardPlacement {
  cellLeft: number;
  cellTop: number;
  cellSpan: number;
  cardWidth: number;
  cardHeight: number;
  cardPadding: number;
  qrSize: number;
}

interface ResponsiveChartQrSizeOptions {
  cellSize: number;
  canvasPadding: number;
  qrCardPadding: number;
  qrCaptionBlockHeight: number;
  qrSectionGap: number;
  baseCanvasWidth: number;
  baseCanvasHeight: number;
  minDisplayedQrSize?: number;
}

export interface AutoDetectionDebugResult {
  mode: string;
  gridWidth: number;
  gridHeight: number;
  cropBox: [number, number, number, number] | null;
  cropRatio: number | null;
  preferredEditorMode: "edit" | "pindou";
  chartFrameDetected?: boolean;
  chartLegendDetected?: boolean;
  chartLayoutAccepted?: boolean;
  wholeLegendTop?: number | null;
  wholeDirectCandidateMode?: string | null;
  wholeDirectCandidateGrid?: [number, number] | null;
  wholeDirectCandidateCrop?: [number, number, number, number] | null;
  wholeSeparatorBoardBox?: [number, number, number, number] | null;
  trimmedContentBox?: [number, number, number, number] | null;
  trimmedLegendTop?: number | null;
  trimmedLegendCandidateMode?: string | null;
  trimmedLegendCandidateGrid?: [number, number] | null;
  trimmedLegendCandidateCrop?: [number, number, number, number] | null;
  trimmedSeparatorBoardBox?: [number, number, number, number] | null;
  trimmedBoardDetectionMode?: string | null;
  trimmedBoardDetectionGrid?: [number, number] | null;
  trimmedBoardDetectionCrop?: [number, number, number, number] | null;
  trimmedDenseBandBox?: [number, number, number, number] | null;
  trimmedConnectedBox?: [number, number, number, number] | null;
  trimmedHoughGrid?: [number, number] | null;
  trimmedHoughCrop?: [number, number, number, number] | null;
  trimmedSeparatorFamilyMode?: string | null;
  trimmedSeparatorFamilyGrid?: [number, number] | null;
  trimmedSeparatorFamilyCrop?: [number, number, number, number] | null;
  trimmedConnectedFamilyMode?: string | null;
  trimmedConnectedFamilyGrid?: [number, number] | null;
  trimmedConnectedFamilyCrop?: [number, number, number, number] | null;
}

function getBaseChartQrSize(cellSize: number) {
  return Math.max(232, Math.floor(cellSize * 7.8));
}

function getBelowBoardQrCardWidth(cellSize: number, qrSize: number, qrCardPadding: number) {
  return Math.max(
    qrSize + qrCardPadding * 2,
    qrSize + Math.max(120, Math.floor(cellSize * 6)),
  );
}

function getBelowBoardQrCardHeight(qrSize: number, qrCardPadding: number, qrCaptionBlockHeight: number) {
  return qrSize + qrCardPadding * 2 + Math.max(0, qrCaptionBlockHeight);
}

export function getChartSnsDisplayScale(canvasWidth: number, canvasHeight: number) {
  if (canvasWidth <= 0 || canvasHeight <= 0) {
    return 1;
  }

  return Math.min(
    1,
    SNS_MAX_EXPORT_WIDTH / canvasWidth,
    SNS_MAX_EXPORT_HEIGHT / canvasHeight,
  );
}

export function getMinimumQrSizeForSnsReadable(
  canvasWidth: number,
  canvasHeight: number,
  minDisplayedQrSize = MIN_SNS_DISPLAY_QR_SIZE,
) {
  const scale = getChartSnsDisplayScale(canvasWidth, canvasHeight);
  return Math.ceil(minDisplayedQrSize / Math.max(scale, 0.0001));
}

export function resolveResponsiveChartQrSize({
  cellSize,
  canvasPadding,
  qrCardPadding,
  qrCaptionBlockHeight,
  qrSectionGap,
  baseCanvasWidth,
  baseCanvasHeight,
  minDisplayedQrSize = MIN_SNS_DISPLAY_QR_SIZE,
}: ResponsiveChartQrSizeOptions) {
  let qrSize = Math.max(
    getBaseChartQrSize(cellSize),
    getMinimumQrSizeForSnsReadable(baseCanvasWidth, baseCanvasHeight, minDisplayedQrSize),
  );

  for (let iteration = 0; iteration < 6; iteration += 1) {
    const qrCardWidth = getBelowBoardQrCardWidth(cellSize, qrSize, qrCardPadding);
    const qrCardHeight = getBelowBoardQrCardHeight(qrSize, qrCardPadding, qrCaptionBlockHeight);
    const canvasWidth = Math.max(baseCanvasWidth, qrCardWidth + canvasPadding * 2);
    const canvasHeight = baseCanvasHeight + qrSectionGap + qrCardHeight;
    const requiredQrSize = Math.max(
      getBaseChartQrSize(cellSize),
      getMinimumQrSizeForSnsReadable(canvasWidth, canvasHeight, minDisplayedQrSize),
    );

    if (requiredQrSize <= qrSize) {
      break;
    }

    qrSize = requiredQrSize;
  }

  return qrSize;
}

export interface AutoDetectionDebugInput {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function measureHexDistance255(
  leftHex: string | null,
  rightHex: string | null,
) {
  if (!leftHex && !rightHex) {
    return 0;
  }
  if (!leftHex || !rightHex) {
    return 255;
  }

  const left = rgbToOklab(hexToRgb(leftHex.toUpperCase()));
  const right = rgbToOklab(hexToRgb(rightHex.toUpperCase()));
  return Math.sqrt(oklabDistanceSquared(left, right)) * 255;
}

interface PaletteDefinition {
  id: string;
  label: string;
  colors: PaletteColor[];
  byLabel: Map<string, PaletteColor>;
  options: PaletteOption[];
}

interface DetectionPreparation {
  raster: RasterImage;
  scaleX: number;
  scaleY: number;
}

const MARD_221_GRAYSCALE_MATCH_LABELS = new Set([
  "H2",
  "H1",
  "H17",
  "H10",
  "H9",
  "H11",
  "H22",
  "H3",
  "H4",
  "H5",
  "H6",
  "H7",
]);

function buildPaletteDefinition(
  id: string,
  label: string,
  labelToHex: Record<string, string>,
): PaletteDefinition {
  const colors = orderPaletteByPerceptualAdjacency(
    Object.entries(labelToHex)
    .map(([entryLabel, hex]) => {
      const normalizedHex = hex.toUpperCase();
      const rgb = hexToRgb(normalizedHex);
      return {
        label: entryLabel,
        hex: normalizedHex,
        rgb,
        oklab: rgbToOklab(rgb),
      };
    }),
  );

  return {
    id,
    label,
    colors,
    byLabel: new Map(colors.map((entry) => [entry.label, entry])),
    options: colors.map((entry) => ({
      label: entry.label,
      hex: entry.hex,
    })),
  };
}

function orderPaletteByPerceptualAdjacency(colors: PaletteColor[]) {
  if (colors.length <= 2) {
    return [...colors];
  }

  const remaining = [...colors];
  remaining.sort((left, right) => {
    const leftChroma = left.oklab[1] * left.oklab[1] + left.oklab[2] * left.oklab[2];
    const rightChroma = right.oklab[1] * right.oklab[1] + right.oklab[2] * right.oklab[2];
    if (right.oklab[0] !== left.oklab[0]) {
      return right.oklab[0] - left.oklab[0];
    }
    if (leftChroma !== rightChroma) {
      return leftChroma - rightChroma;
    }
    return left.label.localeCompare(right.label, "en");
  });

  const ordered: PaletteColor[] = [];
  ordered.push(remaining.shift()!);

  while (remaining.length > 0) {
    const previous = ordered[ordered.length - 1];
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const distance = oklabDistanceSquared(previous.oklab, remaining[index].oklab);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    ordered.push(remaining.splice(bestIndex, 1)[0]);
  }

  return ordered;
}

const paletteDefinitions = new Map<string, PaletteDefinition>(
  sharedColorSystemDefinitions.map((entry) => [
    entry.id,
    buildPaletteDefinition(entry.id, entry.label, entry.labelToHex),
  ]),
);
const mard221CommonDefinition = sharedColorSystemById.get("mard_221");
const grayscaleCommonLabelIndexes = new Set(
  (mard221CommonDefinition?.commonLabels ?? [])
    .map((label, index) => (MARD_221_GRAYSCALE_MATCH_LABELS.has(label) ? index : -1))
    .filter((index) => index >= 0),
);

export const colorSystemOptions: ColorSystemOption[] = sharedColorSystemDefinitions.map(
  (entry) => ({
    id: entry.id,
    label: entry.label,
  }),
);

function getPaletteDefinition(colorSystemId = "mard_221"): PaletteDefinition {
  return paletteDefinitions.get(colorSystemId) ?? paletteDefinitions.get("mard_221")!;
}

function buildPaletteSubsetDefinition(
  base: PaletteDefinition,
  labels: Set<string>,
): PaletteDefinition {
  const colors = base.colors.filter((entry) => labels.has(entry.label));
  return {
    id: base.id,
    label: base.label,
    colors,
    byLabel: new Map(colors.map((entry) => [entry.label, entry])),
    options: colors.map((entry) => ({
      label: entry.label,
      hex: entry.hex,
    })),
  };
}

const grayscalePaletteDefinitions = new Map(
  sharedColorSystemDefinitions.map((entry) => {
    const labels = entry.commonLabels.filter((_, index) => grayscaleCommonLabelIndexes.has(index));
    return [
      entry.id,
      buildPaletteSubsetDefinition(
        getPaletteDefinition(entry.id),
        new Set(labels),
      ),
    ] as const;
  }),
);

function getMatchingPaletteDefinition(
  colorSystemId = "mard_221",
  grayscaleMode = false,
) {
  return grayscaleMode
    ? grayscalePaletteDefinitions.get(colorSystemId) ?? grayscalePaletteDefinitions.get("mard_221")!
    : getPaletteDefinition(colorSystemId);
}

export function getPaletteOptions(colorSystemId = "mard_221", grayscaleMode = false): PaletteOption[] {
  return getMatchingPaletteDefinition(colorSystemId, grayscaleMode).options;
}

function getDefaultRenderStyleBias(grayscaleMode: boolean) {
  return grayscaleMode ? 0 : 100;
}

export function debugMatchLogicalRasterToPalette(
  logical: RasterImage,
  colorSystemId = "mard_221",
  grayscaleMode = false,
  renderStyleBias = getDefaultRenderStyleBias(grayscaleMode),
) {
  const clampedRenderStyleBias = Math.max(0, Math.min(100, renderStyleBias));
  return matchPalette(logical, getMatchingPaletteDefinition(colorSystemId, grayscaleMode), {
    ditherStrength: 1 - clampedRenderStyleBias / 100,
  }).cells;
}

const defaultProcessMessages: ProcessMessages = {
  nonPixelArtError:
    "This image does not look like grid-based pixel art. Switch to Manual Grid and provide width and height first.",
  manualGridRequired: "Manual mode requires both grid width and grid height.",
  canvasContextUnavailable: "Canvas 2D context is not available in this browser.",
  encodingFailed: "Failed to encode output image.",
  chartSerializationTooManyColors:
    "This chart uses more than 256 colors, so it cannot be saved into the compact chart format.",
  chartQrTooLarge: "This chart is too large to fit in a QR code.",
  chartQrCaption: "Scan the QR code to open the super-handy Pindou Mode.",
  chartTitle: (width, height) => `Bead Chart - ${width} x ${height}`,
  chartMetaLine: (colorSystemLabel, totalBeads) => `${colorSystemLabel} 路 ${totalBeads} beads`,
};

function getCachedEmbeddedChartResult(file: File) {
  if (!isPngLikeFile(file)) {
    return Promise.resolve<ProcessResult | null>(null);
  }

  let cached = embeddedChartResultCache.get(file);
  if (!cached) {
    cached = tryLoadEmbeddedChartResult(file).catch((error) => {
      embeddedChartResultCache.delete(file);
      throw error;
    });
    embeddedChartResultCache.set(file, cached);
  }
  return cached;
}

function getCachedFileRaster(
  file: File,
  canvasContextUnavailableMessage: string,
) {
  let cached = rasterCache.get(file);
  if (!cached) {
    cached = loadFileAsRaster(file, canvasContextUnavailableMessage).catch((error) => {
      rasterCache.delete(file);
      throw error;
    });
    rasterCache.set(file, cached);
  }
  return cached;
}

function getCachedCropRaster(
  source: RasterImage,
  cropRect: NormalizedCropRect | null | undefined,
) {
  if (!cropRect) {
    return source;
  }

  let cache = croppedRasterCache.get(source);
  if (!cache) {
    cache = new Map<string, RasterImage>();
    croppedRasterCache.set(source, cache);
  }

  const key = `${cropRect.x.toFixed(6)}:${cropRect.y.toFixed(6)}:${cropRect.width.toFixed(6)}:${cropRect.height.toFixed(6)}`;
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const cropped = cropNormalizedRaster(source, cropRect);
  cache.set(key, cropped);
  return cropped;
}

function getCachedAutoDetection(source: RasterImage) {
  let cached = autoDetectionCache.get(source);
  if (!cached) {
    cached = detectAutoRasterWithWasm(source).catch((error) => {
        autoDetectionCache.delete(source);
        throw error;
      });
    autoDetectionCache.set(source, cached);
  }
  return cached;
}

function getCachedLogicalGrid(
  source: RasterImage,
  key: string,
  build: () => RasterImage | Promise<RasterImage>,
) {
  let cache = logicalGridCache.get(source);
  if (!cache) {
    cache = new Map<string, Promise<RasterImage>>();
    logicalGridCache.set(source, cache);
  }

  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const logical = Promise.resolve(build()).catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, logical);
  return logical;
}

export async function processImageFile(
  file: File,
  options: ProcessOptions,
): Promise<ProcessResult> {
  const processMessages = {
    ...defaultProcessMessages,
    ...options.messages,
  };
  const embeddedResult = await getCachedEmbeddedChartResult(file);
  if (embeddedResult) {
    return embeddedResult;
  }

  const grayscaleMode = options.grayscaleMode ?? false;
  const contrast = options.contrast ?? 0;
  const renderStyleBias = Math.max(
    0,
    Math.min(100, options.renderStyleBias ?? getDefaultRenderStyleBias(grayscaleMode)),
  );
  const pixelArtBias = renderStyleBias / 100;
  const ditherStrength = 1 - pixelArtBias;
  const paletteDefinition = getPaletteDefinition(options.colorSystemId);
  const matchingPaletteDefinition = getMatchingPaletteDefinition(
    paletteDefinition.id,
    grayscaleMode,
  );
  const loadedSource = await getCachedFileRaster(file, processMessages.canvasContextUnavailable);
  const source = getCachedCropRaster(loadedSource, options.cropRect);
  const fftEdgeEnhanceEnabled = options.fftEdgeEnhance ?? false;
  const fftEdgeEnhanceStrength = options.fftEdgeEnhanceStrength ?? 30;
  const effectivePreSharpen = grayscaleMode ? false : options.preSharpen;
  let logical: RasterImage;
  let gridWidth: number;
  let gridHeight: number;
  let detectionMode: string;
  let preferredEditorMode: "edit" | "pindou" = "edit";
  let detectedCropRect: NormalizedCropRect | null = null;

  if (options.gridMode === "auto") {
    const wasmDetection = await getCachedAutoDetection(source);
    if (!wasmDetection) {
      throw new Error(processMessages.nonPixelArtError);
    }

    logical = await getCachedLogicalGrid(
      source,
      `auto:${wasmDetection.kind}:${wasmDetection.cropBox.join(",")}:${wasmDetection.gridWidth}:${wasmDetection.gridHeight}:${renderStyleBias}`,
      () => sampleRegularGrid(
        cropRaster(source, wasmDetection.cropBox),
        wasmDetection.gridWidth,
        wasmDetection.gridHeight,
        wasmDetection.kind === "chart" ? "chart-edge" : "patch",
        pixelArtBias,
      ),
    );
    gridWidth = wasmDetection.gridWidth;
    gridHeight = wasmDetection.gridHeight;
    detectionMode =
      wasmDetection.kind === "chart" ? "detected-wasm-chart" : "detected-wasm-pixel";
    preferredEditorMode = wasmDetection.kind === "chart" ? "pindou" : "edit";
    detectedCropRect = cropBoxToNormalizedCropRect(
      source.width,
      source.height,
      wasmDetection.cropBox,
    );
  } else {
    if (!options.gridWidth || !options.gridHeight) {
      throw new Error(processMessages.manualGridRequired);
    }

    const manualFftEdgeEnhance =
      grayscaleMode
        ? false
        : options.applyAutoFftEdgeEnhanceDefault
          ? true
          : fftEdgeEnhanceEnabled;
    gridWidth = options.gridWidth;
    gridHeight = options.gridHeight;
    logical = await getCachedLogicalGrid(
      source,
      `manual:v4:${gridWidth}:${gridHeight}:${renderStyleBias}:${effectivePreSharpen ? 1 : 0}:${options.preSharpenStrength}:${manualFftEdgeEnhance ? 1 : 0}:${fftEdgeEnhanceStrength}`,
      () => convertImageToLogicalGrid(
        source,
        gridWidth,
        gridHeight,
        effectivePreSharpen,
        options.preSharpenStrength,
        manualFftEdgeEnhance,
        fftEdgeEnhanceStrength,
        "patch",
        pixelArtBias,
      ),
    );
    detectionMode = "converted-from-image";
  }

  if (grayscaleMode) {
    logical = convertRasterToGrayscale(logical);
    logical = applySoftGrayscaleToneCurve(logical);
  }
  if (contrast !== 0) {
    logical = applyContrast(logical, contrast);
  }

  const effectiveReduceColors =
    grayscaleMode
      ? false
      : options.applyAutoReduceColorsDefault &&
          options.gridMode === "auto" &&
          detectionMode === "detected-wasm-pixel" &&
          gridWidth < 30 &&
          gridHeight < 30
        ? false
        : options.reduceColors;
  const effectiveFftEdgeEnhance =
    grayscaleMode
      ? false
      : options.applyAutoFftEdgeEnhanceDefault
        ? detectionMode === "converted-from-image"
        : fftEdgeEnhanceEnabled;

  const originalUniqueColors = countUniqueColors(logical.data);
  let reducedUniqueColors = originalUniqueColors;
  if (effectiveReduceColors) {
    const reduced = reduceColorsPhotoshopStyle(logical, options.reduceTolerance, {
      preserveEdges: detectionMode === "converted-from-image",
    });
    logical = reduced.image;
    reducedUniqueColors = reduced.reducedUniqueColors;
  }

  let matched = matchPalette(logical, matchingPaletteDefinition, {
    ditherStrength,
  });
  if (effectiveFftEdgeEnhance && detectionMode === "converted-from-image") {
    const fftEdgeEnhanceOverrideColor =
      options.fftEdgeEnhanceOverrideLabel
        ? matchingPaletteDefinition.byLabel.get(options.fftEdgeEnhanceOverrideLabel) ?? null
        : null;
    matched = {
      cells: enhancePixelOutlineContinuity(
        matched.cells,
        gridWidth,
        gridHeight,
        fftEdgeEnhanceStrength,
        fftEdgeEnhanceOverrideColor
          ? {
              label: fftEdgeEnhanceOverrideColor.label,
              hex: fftEdgeEnhanceOverrideColor.hex,
              source: "detected",
            }
          : null,
      ),
    };
  }
  const normalizedCells = collapseOpenBackgroundAreas(
    matched.cells,
    gridWidth,
    gridHeight,
  );
  const colors = summarizeCells(normalizedCells, paletteDefinition);
  const totalBeads = colors.reduce((sum, color) => sum + color.count, 0);
  const canvas = await renderChart(
    normalizedCells,
    colors,
    gridWidth,
    gridHeight,
    chooseCellSize(gridWidth, gridHeight, options.cellSize),
    processMessages.chartTitle(gridWidth, gridHeight),
    processMessages.chartMetaLine(paletteDefinition.label, totalBeads),
    processMessages.canvasContextUnavailable,
    processMessages.chartQrTooLarge,
    processMessages.chartQrCaption,
    undefined,
  );
  const blob = await buildChartBlobWithMetadata(
    canvas,
    {
      cells: normalizedCells,
      colorSystemId: paletteDefinition.id,
      fileName: defaultOutputName(file.name, gridWidth, gridHeight),
      gridWidth,
      gridHeight,
      preferredEditorMode,
    },
    processMessages,
    false,
  );

  return {
    blob,
    fileName: defaultOutputName(file.name, gridWidth, gridHeight),
    colorSystemId: paletteDefinition.id,
    chartTitle: undefined,
    detectionMode,
    effectiveReduceColors,
    effectiveFftEdgeEnhance,
    preferredEditorMode,
    editingLocked: false,
    detectedCropRect,
    gridWidth,
    gridHeight,
    originalUniqueColors,
    reducedUniqueColors,
    paletteColorsUsed: colors.length,
    colors,
    cells: normalizedCells,
  };
}

export async function debugAutoDetectRaster(
  image: AutoDetectionDebugInput,
  fileName: string,
  options?: { detailed?: boolean },
): Promise<AutoDetectionDebugResult> {
  void fileName;
  void options;

  const raster: RasterImage = {
    width: image.width,
    height: image.height,
    data: image.data,
  };
  const detection = await detectAutoRasterWithWasm(raster);
  if (!detection) {
    return {
      mode: "none",
      gridWidth: 0,
      gridHeight: 0,
      cropBox: null,
      cropRatio: null,
      preferredEditorMode: "edit",
    };
  }

  const cropWidth = detection.cropBox[2] - detection.cropBox[0];
  const cropHeight = detection.cropBox[3] - detection.cropBox[1];
  return {
    mode: detection.kind === "chart" ? "detected-wasm-chart" : "detected-wasm-pixel",
    gridWidth: detection.gridWidth,
    gridHeight: detection.gridHeight,
    cropBox: detection.cropBox,
    cropRatio: cropWidth / Math.max(1, cropHeight),
    preferredEditorMode: detection.kind === "chart" ? "pindou" : "edit",
  };
}

export async function exportChartFromCells(options: {
  cells: EditableCell[];
  gridWidth: number;
  gridHeight: number;
  fileName: string;
  colorSystemId?: string;
  cellSize?: number;
  chartSettings?: ChartExportSettings;
  messages?: Partial<ProcessMessages>;
}) {
  const processMessages = {
    ...defaultProcessMessages,
    ...options.messages,
  };
  const outputFileName = defaultOutputName(
    options.fileName,
    options.gridWidth,
    options.gridHeight,
  );
  const paletteDefinition = getPaletteDefinition(options.colorSystemId);
  const normalizedCells = options.cells.map((cell) => normalizeEditableCell(cell));
  const colors = summarizeCells(normalizedCells, paletteDefinition);
  const totalBeads = colors.reduce((sum, color) => sum + color.count, 0);
  const fallbackTitle = processMessages.chartTitle(options.gridWidth, options.gridHeight);
  const chartSettings = options.chartSettings ? { ...options.chartSettings } : undefined;
  if (chartSettings?.includeQrCode) {
    chartSettings.shareUrl = buildChartShareUrl(
      serializeCompactChartPayload(
        {
          cells: normalizedCells,
          colorSystemId: paletteDefinition.id,
          gridWidth: options.gridWidth,
          gridHeight: options.gridHeight,
          editingLocked: chartSettings.lockEditing,
          title: chartSettings.chartTitle,
        },
        {
          includeManualRuns: false,
          includePreferredEditorMode: false,
        },
        processMessages,
      ),
    );
  }
  const canvas = await renderChart(
    normalizedCells,
    colors,
    options.gridWidth,
    options.gridHeight,
    chooseCellSize(options.gridWidth, options.gridHeight, options.cellSize),
    buildExportChartTitle(
      chartSettings?.chartTitle,
      options.gridWidth,
      options.gridHeight,
      fallbackTitle,
    ),
    processMessages.chartMetaLine(paletteDefinition.label, totalBeads),
    processMessages.canvasContextUnavailable,
    processMessages.chartQrTooLarge,
    processMessages.chartQrCaption,
    chartSettings,
  );
  const blob = await buildChartBlobWithMetadata(
    canvas,
    {
      cells: normalizedCells,
      colorSystemId: paletteDefinition.id,
      fileName: outputFileName,
      gridWidth: options.gridWidth,
      gridHeight: options.gridHeight,
      preferredEditorMode: "pindou",
      editingLocked: chartSettings?.lockEditing ?? false,
      chartTitle: chartSettings?.chartTitle,
    },
    processMessages,
    (chartSettings?.saveMetadata ?? true) || (chartSettings?.lockEditing ?? false),
  );
  return {
    blob,
    fileName: outputFileName,
    colorSystemId: paletteDefinition.id,
    paletteColorsUsed: colors.length,
    colors,
  };
}

async function buildChartBlobWithMetadata(
  canvas: HTMLCanvasElement,
  metadataInput: {
    cells: EditableCell[];
    colorSystemId: string;
    fileName: string;
    gridWidth: number;
    gridHeight: number;
    preferredEditorMode: "edit" | "pindou";
    editingLocked?: boolean;
    chartTitle?: string;
  },
  processMessages: ProcessMessages,
  includeMetadata = true,
) {
  const baseBlob = await canvasToBlob(canvas, processMessages.encodingFailed);
  if (!includeMetadata) {
    return baseBlob;
  }

  try {
    const metadata = buildEmbeddedChartMetadata(metadataInput);
    return embedChartMetadataInPngBlob(baseBlob, metadata);
  } catch (error) {
    throw mapChartSerializationError(error, processMessages);
  }
}

async function tryLoadEmbeddedChartResult(file: File): Promise<ProcessResult | null> {
  if (!isPngLikeFile(file)) {
    return null;
  }

  const metadata = await readEmbeddedChartMetadataFromFile(file);
  if (!metadata) {
    return null;
  }

  const paletteDefinition = getPaletteDefinition(metadata.colorSystemId);
  const expectedLength = metadata.gridWidth * metadata.gridHeight;
  if (
    metadata.gridWidth <= 0 ||
    metadata.gridHeight <= 0 ||
    expectedLength <= 0 ||
    metadata.cells.length !== expectedLength
  ) {
    return null;
  }

  const cells = metadata.cells.map((entry) => {
    if (!entry) {
      return { label: null, hex: null, source: null } satisfies EditableCell;
    }

    const [label, sourceFlag] = entry;
    const paletteColor = paletteDefinition.byLabel.get(label);
    if (!paletteColor) {
      return { label: null, hex: null, source: null } satisfies EditableCell;
    }

    return {
      label,
      hex: paletteColor.hex,
      source: sourceFlag === 1 ? "manual" : "detected",
    } satisfies EditableCell;
  });

  const colors = summarizeCells(cells, paletteDefinition);
  const uniqueColors = colors.length;
  const editingLocked = metadata.editingLocked ?? false;
  return {
    blob: file,
    fileName: defaultOutputName(file.name, metadata.gridWidth, metadata.gridHeight),
    colorSystemId: paletteDefinition.id,
    chartTitle: metadata.chartTitle,
    detectionMode: "embedded-chart-metadata",
    effectiveReduceColors: true,
    effectiveFftEdgeEnhance: false,
    preferredEditorMode: editingLocked ? "pindou" : (metadata.preferredEditorMode ?? "pindou"),
    editingLocked,
    detectedCropRect: null,
    gridWidth: metadata.gridWidth,
    gridHeight: metadata.gridHeight,
    originalUniqueColors: uniqueColors,
    reducedUniqueColors: uniqueColors,
    paletteColorsUsed: uniqueColors,
    colors,
    cells,
  };
}

function buildEmbeddedChartMetadata(input: {
  cells: EditableCell[];
  colorSystemId: string;
  fileName: string;
  gridWidth: number;
  gridHeight: number;
  preferredEditorMode: "edit" | "pindou";
  editingLocked?: boolean;
  chartTitle?: string;
}): EmbeddedChartMetadata {
  return {
    version: CHART_METADATA_VERSION,
    app: CHART_METADATA_APP,
    colorSystemId: input.colorSystemId,
    fileName: input.fileName,
    gridWidth: input.gridWidth,
    gridHeight: input.gridHeight,
    preferredEditorMode: input.preferredEditorMode,
    editingLocked: input.editingLocked ?? false,
    chartTitle: input.chartTitle?.trim() || undefined,
    cells: buildSerializedChartCells(input.cells),
  };
}

function buildSerializedChartCells(cells: EditableCell[]): Array<[string, 1 | 0] | null> {
  return cells.map((cell) => {
    const normalized = normalizeEditableCell(cell);
    if (!normalized.label) {
      return null;
    }
    return [normalized.label, normalized.source === "manual" ? 1 : 0];
  });
}

function serializeCompactChartPayload(
  input: {
    cells: EditableCell[];
    colorSystemId: string;
    gridWidth: number;
    gridHeight: number;
    preferredEditorMode?: "edit" | "pindou";
    editingLocked?: boolean;
    title?: string;
  },
  options: {
    includeManualRuns: boolean;
    includePreferredEditorMode: boolean;
  },
  processMessages: ProcessMessages,
) {
  try {
    return serializeChartPayload(
      {
        colorSystemId: input.colorSystemId,
        gridWidth: input.gridWidth,
        gridHeight: input.gridHeight,
        preferredEditorMode: input.preferredEditorMode,
        editingLocked: input.editingLocked,
        title: input.title,
        cells: buildSerializedChartCells(input.cells),
      },
      options,
    );
  } catch (error) {
    throw mapChartSerializationError(error, processMessages);
  }
}

function mapChartSerializationError(error: unknown, processMessages: ProcessMessages) {
  if (error instanceof ChartSerializationError && error.code === "too-many-colors") {
    return new Error(processMessages.chartSerializationTooManyColors);
  }
  return error instanceof Error ? error : new Error(processMessages.encodingFailed);
}

function buildExportChartTitle(
  customTitle: string | undefined,
  gridWidth: number,
  gridHeight: number,
  fallbackTitle: string,
) {
  const trimmedTitle = customTitle?.trim();
  if (!trimmedTitle) {
    return fallbackTitle;
  }

  return `${trimmedTitle} - ${gridWidth} x ${gridHeight}`;
}

async function loadFileAsRaster(
  file: File,
  canvasContextUnavailableMessage: string,
): Promise<RasterImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error(canvasContextUnavailableMessage);
    }

    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
      width: imageData.width,
      height: imageData.height,
      data: imageData.data,
    };
  } finally {
    bitmap.close();
  }
}

function prepareDetectionRaster(image: RasterImage): DetectionPreparation {
  const maxEdge = Math.max(image.width, image.height);
  if (maxEdge <= MAX_DETECTION_EDGE) {
    return {
      raster: image,
      scaleX: 1,
      scaleY: 1,
    };
  }

  const scale = MAX_DETECTION_EDGE / maxEdge;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  const sourceStepX = image.width / width;
  const sourceStepY = image.height / height;

  for (let targetY = 0; targetY < height; targetY += 1) {
    const sourceY = Math.max(0, Math.min(image.height - 1, Math.round((targetY + 0.5) * sourceStepY - 0.5)));
    for (let targetX = 0; targetX < width; targetX += 1) {
      const sourceX = Math.max(0, Math.min(image.width - 1, Math.round((targetX + 0.5) * sourceStepX - 0.5)));
      const sourceIndex = (sourceY * image.width + sourceX) * 4;
      const targetIndex = (targetY * width + targetX) * 4;
      data[targetIndex] = image.data[sourceIndex] ?? 0;
      data[targetIndex + 1] = image.data[sourceIndex + 1] ?? 0;
      data[targetIndex + 2] = image.data[sourceIndex + 2] ?? 0;
      data[targetIndex + 3] = image.data[sourceIndex + 3] ?? 255;
    }
  }

  return {
    raster: {
      width,
      height,
      data,
    },
    scaleX: image.width / width,
    scaleY: image.height / height,
  };
}

function mapPreparedCropBoxToSource(
  cropBox: CropBox,
  source: RasterImage,
  prepared: DetectionPreparation,
): CropBox {
  if (prepared.scaleX === 1 && prepared.scaleY === 1) {
    return cropBox;
  }

  return [
    Math.max(0, Math.min(source.width - 1, Math.round(cropBox[0] * prepared.scaleX))),
    Math.max(0, Math.min(source.height - 1, Math.round(cropBox[1] * prepared.scaleY))),
    Math.max(1, Math.min(source.width, Math.round(cropBox[2] * prepared.scaleX))),
    Math.max(1, Math.min(source.height, Math.round(cropBox[3] * prepared.scaleY))),
  ];
}

function buildPreparedWasmChartDetection(
  image: RasterImage,
  prepared: DetectionPreparation,
  detection: {
    cropBox: CropBox;
    gridWidth: number;
    gridHeight: number;
  } | null,
): {
  gridWidth: number;
  gridHeight: number;
  mode: string;
  cropBox: CropBox;
} | null {
  if (!detection) {
    return null;
  }

  const refinedDetection = refinePreparedWasmGuideDetection(prepared.raster, detection);

  const cropBox = mapPreparedCropBoxToSource(refinedDetection.cropBox, image, prepared);
  const cropWidth = cropBox[2] - cropBox[0];
  const cropHeight = cropBox[3] - cropBox[1];
  if (cropWidth <= 0 || cropHeight <= 0) {
    return null;
  }

  if (
    refinedDetection.gridWidth < 10 ||
    refinedDetection.gridWidth > 102 ||
    refinedDetection.gridHeight < 10 ||
    refinedDetection.gridHeight > 102
  ) {
    return null;
  }

  const cropAspect = cropWidth / Math.max(1, cropHeight);
  const gridAspect = refinedDetection.gridWidth / Math.max(1, refinedDetection.gridHeight);
  const aspectRatio =
    cropAspect > gridAspect ? cropAspect / Math.max(0.0001, gridAspect) : gridAspect / Math.max(0.0001, cropAspect);
  if (aspectRatio > 1.18) {
    return null;
  }

  const cellWidth = cropWidth / refinedDetection.gridWidth;
  const cellHeight = cropHeight / refinedDetection.gridHeight;
  if (cellWidth < 2 || cellHeight < 2) {
    return null;
  }

  const areaRatio = (cropWidth * cropHeight) / Math.max(1, image.width * image.height);
  if (areaRatio < 0.16) {
    return null;
  }

  return {
    gridWidth: refinedDetection.gridWidth,
    gridHeight: refinedDetection.gridHeight,
    mode: "detected-wasm-cv",
    cropBox,
  };
}

function refinePreparedWasmGuideDetection(
  image: RasterImage,
  detection: {
    cropBox: CropBox;
    gridWidth: number;
    gridHeight: number;
  },
) {
  const xGuide = detectStrongGuideFamily(image, detection.cropBox, "x");
  const yGuide = detectStrongGuideFamily(image, detection.cropBox, "y");

  let [left, top, right, bottom] = detection.cropBox;
  let gridWidth = detection.gridWidth;
  let gridHeight = detection.gridHeight;

  if (xGuide) {
    const guideCell = xGuide.period / 5;
    left = xGuide.firstPeak;

    const rightRemainder = image.width - xGuide.lastPeak;
    if (rightRemainder >= xGuide.period * 0.75 && rightRemainder <= xGuide.period * 1.25) {
      right = Math.min(image.width, xGuide.lastPeak + xGuide.period);
    } else {
      right = Math.max(right, xGuide.lastPeak);
    }

    gridWidth = Math.round((right - left) / guideCell);
  }

  if (yGuide) {
    const guideCell = yGuide.period / 5;
    top = yGuide.firstPeak;

    const bottomRemainder = image.height - yGuide.lastPeak;
    if (bottomRemainder >= yGuide.period * 0.75 && bottomRemainder <= yGuide.period * 1.25) {
      bottom = Math.min(image.height, yGuide.lastPeak + yGuide.period);
    } else {
      bottom = Math.max(bottom, yGuide.lastPeak);
    }

    gridHeight = Math.round((bottom - top) / guideCell);
    if (
      Math.abs(top - yGuide.firstPeak) <= guideCell * 0.6 &&
      Math.abs(bottom - yGuide.lastPeak) <= guideCell * 0.6
    ) {
      gridHeight += 1;
    }
  }

  return {
    cropBox: [left, top, right, bottom] as CropBox,
    gridWidth,
    gridHeight,
  };
}

function detectStrongGuideFamily(
  image: RasterImage,
  cropBox: CropBox,
  axis: "x" | "y",
) {
  const signal = buildGuideCoverageSignal(image, cropBox, axis);
  const peaks = findStrongGuidePeaks(signal);
  if (peaks.length < 5) {
    return null;
  }

  const diffs: number[] = [];
  for (let index = 0; index < peaks.length - 1; index += 1) {
    const diff = peaks[index + 1] - peaks[index];
    if (diff >= 120 && diff <= 320) {
      diffs.push(diff);
    }
  }
  if (diffs.length < 4) {
    return null;
  }

  const period = medianOfNumbers(diffs);
  if (period < 120 || period > 320) {
    return null;
  }

  const start = axis === "x" ? cropBox[0] : cropBox[1];
  const alignedPeaks = peaks.filter((peak) => Math.abs((peak - peaks[0]) % period) <= 18 || Math.abs((peak - peaks[0]) % period - period) <= 18);
  const firstPeak = alignedPeaks[0] ?? peaks[0];
  const lastPeak = alignedPeaks[alignedPeaks.length - 1] ?? peaks[peaks.length - 1];
  if (firstPeak > start + period) {
    return null;
  }

  return {
    period,
    firstPeak,
    lastPeak,
  };
}

function buildGuideCoverageSignal(
  image: RasterImage,
  cropBox: CropBox,
  axis: "x" | "y",
) {
  const [left, top, right, bottom] = cropBox;
  const axisLength = axis === "x" ? image.width : image.height;
  const start = axis === "x" ? top : left;
  const end = axis === "x" ? bottom : right;
  const otherLength = Math.max(1, end - start);
  const signal = new Float32Array(axisLength);
  const counts = new Uint16Array(32);

  for (let line = 0; line < axisLength; line += 1) {
    counts.fill(0);
    let candidates = 0;
    let dominant = 0;
    for (let offset = start; offset < end; offset += 1) {
      const pixel = axis === "x" ? getPixel(image, line, offset) : getPixel(image, offset, line);
      const bucket = classifyGuideBucket(pixel);
      if (bucket === null) {
        continue;
      }
      candidates += 1;
      counts[bucket] += 1;
      if (counts[bucket] > dominant) {
        dominant = counts[bucket];
      }
    }
    if (!candidates) {
      continue;
    }
    const dominantRatio = dominant / candidates;
    const lineCoverage = dominant / otherLength;
    if (dominantRatio >= 0.5 && lineCoverage >= 0.015) {
      signal[line] = lineCoverage;
    }
  }

  return smoothSignal(signal);
}

function findStrongGuidePeaks(signal: Float32Array) {
  const mean = arrayMean(signal);
  let maxValue = 0;
  for (const value of signal) {
    if (value > maxValue) {
      maxValue = value;
    }
  }

  const threshold = Math.max(maxValue * 0.6, mean + 0.05, 0.08);
  const peaks: number[] = [];
  for (let index = 1; index < signal.length - 1; index += 1) {
    const value = signal[index];
    if (value < threshold || value < signal[index - 1] || value < signal[index + 1]) {
      continue;
    }
    if (peaks.length && index - peaks[peaks.length - 1] <= 8) {
      if (value > signal[peaks[peaks.length - 1]]) {
        peaks[peaks.length - 1] = index;
      }
      continue;
    }
    peaks.push(index);
  }
  return peaks;
}

function classifyGuideBucket(pixel: Rgb) {
  const [red, green, blue] = pixel;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  if (luminance < 18 || luminance > 245) {
    return null;
  }
  if (chroma >= 20) {
    return quantizeHueBucket(pixel);
  }
  if (chroma <= 28 && luminance <= 132) {
    return 24;
  }
  return null;
}

function quantizeHueBucket([red, green, blue]: Rgb) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const chroma = max - min;
  if (chroma <= 0) {
    return 24;
  }

  let hueSector = 0;
  if (max === red) {
    hueSector = ((green - blue) / chroma + 6) % 6;
  } else if (max === green) {
    hueSector = (blue - red) / chroma + 2;
  } else {
    hueSector = (red - green) / chroma + 4;
  }

  const hue = hueSector * 60;
  return Math.max(0, Math.min(23, Math.floor(hue / 15)));
}

export async function debugDetectChartBoardWithWasmPrepared(
  image: AutoDetectionDebugInput,
) {
  const raster: RasterImage = {
    width: image.width,
    height: image.height,
    data: image.data,
  };
  const prepared = prepareDetectionRaster(raster);
  const detection = await detectChartBoardWithWasm(raster);
  if (!detection) {
    return null;
  }
  const refined = refinePreparedWasmGuideDetection(raster, detection);
  const built = buildPreparedWasmChartDetection(raster, { raster, scaleX: 1, scaleY: 1 }, detection);
  return {
    raw: detection,
    refined,
    built,
    preparedSize: [prepared.raster.width, prepared.raster.height],
  };
}

function cropRaster(image: RasterImage, cropBox: CropBox): RasterImage {
  const [left, top, right, bottom] = cropBox;
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = ((top + y) * image.width + (left + x)) * 4;
      const targetIndex = (y * width + x) * 4;
      data[targetIndex] = image.data[sourceIndex];
      data[targetIndex + 1] = image.data[sourceIndex + 1];
      data[targetIndex + 2] = image.data[sourceIndex + 2];
      data[targetIndex + 3] = image.data[sourceIndex + 3];
    }
  }

  return { width, height, data };
}

function cropNormalizedRaster(image: RasterImage, cropRect: NormalizedCropRect): RasterImage {
  const x = clampNormalized(cropRect.x);
  const y = clampNormalized(cropRect.y);
  const width = clampNormalized(cropRect.width);
  const height = clampNormalized(cropRect.height);
  const left = Math.max(0, Math.min(image.width - 1, Math.floor(x * image.width)));
  const top = Math.max(0, Math.min(image.height - 1, Math.floor(y * image.height)));
  const right = Math.max(left + 1, Math.min(image.width, Math.ceil((x + width) * image.width)));
  const bottom = Math.max(top + 1, Math.min(image.height, Math.ceil((y + height) * image.height)));
  return cropRaster(image, [left, top, right, bottom]);
}

function cropBoxToNormalizedCropRect(
  width: number,
  height: number,
  cropBox: CropBox,
): NormalizedCropRect | null {
  if (width <= 0 || height <= 0) {
    return null;
  }

  const [left, top, right, bottom] = cropBox;
  if (left <= 0 && top <= 0 && right >= width && bottom >= height) {
    return null;
  }

  return {
    x: clampNormalized(left / width),
    y: clampNormalized(top / height),
    width: clampNormalized((right - left) / width),
    height: clampNormalized((bottom - top) / height),
  };
}

function applySharpen(image: RasterImage, strength: number): RasterImage {
  if (strength <= 0) {
    return cloneRaster(image);
  }

  const blurred = boxBlur(image);
  const amount = 0.25 + (strength / 100) * 0.75;
  const data = new Uint8ClampedArray(image.data.length);
  for (let index = 0; index < image.data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const base = image.data[index + channel];
      const blur = blurred.data[index + channel];
      data[index + channel] = clampToByte(base + (base - blur) * amount);
    }
    data[index + 3] = image.data[index + 3];
  }
  return { width: image.width, height: image.height, data };
}

function boxBlur(image: RasterImage): RasterImage {
  const data = new Uint8ClampedArray(image.data.length);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const sums = [0, 0, 0];
      let colorWeight = 0;
      let alphaSum = 0;
      let count = 0;
      for (let sampleY = Math.max(0, y - 1); sampleY <= Math.min(image.height - 1, y + 1); sampleY += 1) {
        for (let sampleX = Math.max(0, x - 1); sampleX <= Math.min(image.width - 1, x + 1); sampleX += 1) {
          const pixelIndex = (sampleY * image.width + sampleX) * 4;
          const alpha = image.data[pixelIndex + 3];
          const weight = alpha / 255;
          if (weight > 0) {
            sums[0] += image.data[pixelIndex] * weight;
            sums[1] += image.data[pixelIndex + 1] * weight;
            sums[2] += image.data[pixelIndex + 2] * weight;
            colorWeight += weight;
          }
          alphaSum += alpha;
          count += 1;
        }
      }
      const index = (y * image.width + x) * 4;
      data[index] = colorWeight > 0 ? clampToByte(sums[0] / colorWeight) : 0;
      data[index + 1] = colorWeight > 0 ? clampToByte(sums[1] / colorWeight) : 0;
      data[index + 2] = colorWeight > 0 ? clampToByte(sums[2] / colorWeight) : 0;
      data[index + 3] = clampToByte(alphaSum / count);
    }
  }
  return { width: image.width, height: image.height, data };
}

function representativePixelFromPatch(
  image: RasterImage,
  left: number,
  top: number,
  right: number,
  bottom: number,
): RepresentativePixel {
  const patchWidth = Math.max(1, right - left);
  const patchHeight = Math.max(1, bottom - top);
  const totalPixels = patchWidth * patchHeight;
  const bucketCodes = new Int32Array(totalPixels);
  bucketCodes.fill(-1);
  const buckets = new Map<number, { count: number; sum: [number, number, number]; support: number }>();
  let alphaSum = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const pixelIndex = (y * image.width + x) * 4;
      const alpha = image.data[pixelIndex + 3];
      alphaSum += alpha;
      if (alpha < MIN_VISIBLE_PIXEL_ALPHA) {
        continue;
      }
      const red = image.data[pixelIndex];
      const green = image.data[pixelIndex + 1];
      const blue = image.data[pixelIndex + 2];
      const code = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
      const localIndex = (y - top) * patchWidth + (x - left);
      bucketCodes[localIndex] = code;
      const current = buckets.get(code) ?? { count: 0, sum: [0, 0, 0], support: 0 };
      current.count += 1;
      current.sum[0] += red;
      current.sum[1] += green;
      current.sum[2] += blue;
      buckets.set(code, current);
    }
  }

  const averageAlpha = clampToByte(alphaSum / totalPixels);
  if (!buckets.size) {
    return { rgb: [255, 255, 255], alpha: averageAlpha };
  }

  for (let y = 0; y < patchHeight; y += 1) {
    for (let x = 0; x < patchWidth; x += 1) {
      const code = bucketCodes[y * patchWidth + x]!;
      if (code < 0) {
        continue;
      }
      const bucket = buckets.get(code);
      if (!bucket) {
        continue;
      }

      if (x + 1 < patchWidth && bucketCodes[y * patchWidth + x + 1] === code) {
        bucket.support += 2;
      }
      if (y + 1 < patchHeight && bucketCodes[(y + 1) * patchWidth + x] === code) {
        bucket.support += 2;
      }
      if (x + 1 < patchWidth && y + 1 < patchHeight && bucketCodes[(y + 1) * patchWidth + x + 1] === code) {
        bucket.support += 1;
      }
      if (x > 0 && y + 1 < patchHeight && bucketCodes[(y + 1) * patchWidth + x - 1] === code) {
        bucket.support += 1;
      }
    }
  }

  let bestCode = -1;
  let bestBucket: { count: number; sum: [number, number, number]; support: number } | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const [code, bucket] of buckets) {
    const score = bucket.count * 4 + bucket.support;
    if (
      !bestBucket ||
      score > bestScore ||
      (score === bestScore && bucket.count > bestBucket.count)
    ) {
      bestCode = code;
      bestBucket = bucket;
      bestScore = score;
    }
  }
  if (!bestBucket || bestCode === -1) {
    return { rgb: [255, 255, 255], alpha: averageAlpha };
  }

  const mean: Rgb = [
    clampToByte(bestBucket.sum[0] / bestBucket.count),
    clampToByte(bestBucket.sum[1] / bestBucket.count),
    clampToByte(bestBucket.sum[2] / bestBucket.count),
  ];
  const centerX = (patchWidth - 1) / 2;
  const centerY = (patchHeight - 1) / 2;
  let bestPixel: Rgb | null = null;
  let bestPixelSupport = Number.NEGATIVE_INFINITY;
  let bestPixelDistance = Number.POSITIVE_INFINITY;
  let bestPixelCenterDistance = Number.POSITIVE_INFINITY;

  for (let y = 0; y < patchHeight; y += 1) {
    for (let x = 0; x < patchWidth; x += 1) {
      if (bucketCodes[y * patchWidth + x] !== bestCode) {
        continue;
      }

      let localSupport = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }

          const neighborX = x + dx;
          const neighborY = y + dy;
          if (
            neighborX < 0 ||
            neighborY < 0 ||
            neighborX >= patchWidth ||
            neighborY >= patchHeight ||
            bucketCodes[neighborY * patchWidth + neighborX] !== bestCode
          ) {
            continue;
          }

          localSupport += dx === 0 || dy === 0 ? 2 : 1;
        }
      }

      const pixel = getPixel(image, left + x, top + y);
      const distance =
        (pixel[0] - mean[0]) * (pixel[0] - mean[0]) +
        (pixel[1] - mean[1]) * (pixel[1] - mean[1]) +
        (pixel[2] - mean[2]) * (pixel[2] - mean[2]);
      const centerDistance = (x - centerX) * (x - centerX) + (y - centerY) * (y - centerY);
      if (
        !bestPixel ||
        localSupport > bestPixelSupport ||
        (localSupport === bestPixelSupport && distance < bestPixelDistance) ||
        (
          localSupport === bestPixelSupport &&
          distance === bestPixelDistance &&
          centerDistance < bestPixelCenterDistance
        )
      ) {
        bestPixel = pixel;
        bestPixelSupport = localSupport;
        bestPixelDistance = distance;
        bestPixelCenterDistance = centerDistance;
      }
    }
  }

  return { rgb: bestPixel ?? mean, alpha: averageAlpha };
}

export function representativeColorFromPatch(
  image: RasterImage,
  left: number,
  top: number,
  right: number,
  bottom: number,
): Rgb {
  return representativePixelFromPatch(image, left, top, right, bottom).rgb;
}

function representativePixelFromChartPatch(
  image: RasterImage,
  left: number,
  top: number,
  right: number,
  bottom: number,
): RepresentativePixel {
  const fallback = representativePixelFromPatch(image, left, top, right, bottom);
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const xInset = Math.max(0, Math.min(width - 1, Math.round((width - 1) * CHART_EDGE_SAMPLE_INSET)));
  const yInset = Math.max(0, Math.min(height - 1, Math.round((height - 1) * CHART_EDGE_SAMPLE_INSET)));
  const samples: Rgb[] = [];

  function samplePoint(centerX: number, centerY: number) {
    const startX = Math.max(left, centerX - 1);
    const endX = Math.min(right - 1, centerX + 1);
    const startY = Math.max(top, centerY - 1);
    const endY = Math.min(bottom - 1, centerY + 1);
    const sums: [number, number, number] = [0, 0, 0];
    let count = 0;
    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        const pixelIndex = (y * image.width + x) * 4;
        const alpha = image.data[pixelIndex + 3];
        if (alpha < MIN_VISIBLE_PIXEL_ALPHA) {
          continue;
        }
        sums[0] += image.data[pixelIndex];
        sums[1] += image.data[pixelIndex + 1];
        sums[2] += image.data[pixelIndex + 2];
        count += 1;
      }
    }
    if (!count) {
      return;
    }
    samples.push([
      clampToByte(sums[0] / count),
      clampToByte(sums[1] / count),
      clampToByte(sums[2] / count),
    ]);
  }

  for (const progress of CHART_EDGE_SAMPLE_PROGRESS) {
    const primaryX = left + Math.round((width - 1) * progress);
    const mirroredX = left + Math.round((width - 1) * (1 - progress));
    const primaryY = top + Math.round((height - 1) * progress);
    const mirroredY = top + Math.round((height - 1) * (1 - progress));

    samplePoint(primaryX, top + yInset);
    samplePoint(mirroredX, top + yInset);
    samplePoint(primaryX, bottom - 1 - yInset);
    samplePoint(mirroredX, bottom - 1 - yInset);
    samplePoint(left + xInset, primaryY);
    samplePoint(left + xInset, mirroredY);
    samplePoint(right - 1 - xInset, primaryY);
    samplePoint(right - 1 - xInset, mirroredY);
  }

  if (!samples.length) {
    return fallback;
  }

  const buckets = new Map<number, { count: number; sum: [number, number, number] }>();
  for (const sample of samples) {
    const code = ((sample[0] >> 3) << 10) | ((sample[1] >> 3) << 5) | (sample[2] >> 3);
    const current = buckets.get(code) ?? { count: 0, sum: [0, 0, 0] };
    current.count += 1;
    current.sum[0] += sample[0];
    current.sum[1] += sample[1];
    current.sum[2] += sample[2];
    buckets.set(code, current);
  }

  let best: { count: number; sum: [number, number, number] } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) {
      best = bucket;
    }
  }
  if (!best) {
    return fallback;
  }

  return {
    rgb: [
      clampToByte(best.sum[0] / best.count),
      clampToByte(best.sum[1] / best.count),
      clampToByte(best.sum[2] / best.count),
    ],
    alpha: fallback.alpha,
  };
}

function weightedAveragePixelFromPatch(
  image: RasterImage,
  left: number,
  top: number,
  right: number,
  bottom: number,
): RepresentativePixel {
  const patchWidth = Math.max(1, right - left);
  const patchHeight = Math.max(1, bottom - top);
  const centerX = left + patchWidth / 2;
  const centerY = top + patchHeight / 2;
  const radiusX = Math.max(0.8, patchWidth * 0.38);
  const radiusY = Math.max(0.8, patchHeight * 0.38);
  let weightedRed = 0;
  let weightedGreen = 0;
  let weightedBlue = 0;
  let visibleWeight = 0;
  let weightedAlpha = 0;
  let alphaWeight = 0;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const pixelIndex = (y * image.width + x) * 4;
      const alpha = image.data[pixelIndex + 3];
      const dx = (x + 0.5 - centerX) / radiusX;
      const dy = (y + 0.5 - centerY) / radiusY;
      const spatialWeight = Math.exp(-0.5 * (dx * dx + dy * dy));
      weightedAlpha += alpha * spatialWeight;
      alphaWeight += spatialWeight;
      if (alpha < MIN_VISIBLE_PIXEL_ALPHA) {
        continue;
      }

      const weight = spatialWeight * (alpha / 255);
      weightedRed += image.data[pixelIndex] * weight;
      weightedGreen += image.data[pixelIndex + 1] * weight;
      weightedBlue += image.data[pixelIndex + 2] * weight;
      visibleWeight += weight;
    }
  }

  return {
    rgb:
      visibleWeight > 0
        ? [
            clampToByte(weightedRed / visibleWeight),
            clampToByte(weightedGreen / visibleWeight),
            clampToByte(weightedBlue / visibleWeight),
          ]
        : [255, 255, 255],
    alpha: alphaWeight > 0 ? clampToByte(weightedAlpha / alphaWeight) : 0,
  };
}

function blendRepresentativePixels(
  realistic: RepresentativePixel,
  pixelArt: RepresentativePixel,
  pixelArtBias: number,
): RepresentativePixel {
  const clampedBias = Math.max(0, Math.min(1, pixelArtBias));
  const realisticWeight = 1 - clampedBias;
  return {
    rgb: [
      clampToByte(realistic.rgb[0] * realisticWeight + pixelArt.rgb[0] * clampedBias),
      clampToByte(realistic.rgb[1] * realisticWeight + pixelArt.rgb[1] * clampedBias),
      clampToByte(realistic.rgb[2] * realisticWeight + pixelArt.rgb[2] * clampedBias),
    ],
    alpha: clampToByte(realistic.alpha * realisticWeight + pixelArt.alpha * clampedBias),
  };
}

function sampleRegularGrid(
  image: RasterImage,
  gridWidth: number,
  gridHeight: number,
  strategy: SamplingStrategy = "patch",
  pixelArtBias = 1,
): RasterImage {
  const xEdges = buildEdges(image.width, gridWidth);
  const yEdges = buildEdges(image.height, gridHeight);
  const data = new Uint8ClampedArray(gridWidth * gridHeight * 4);

  for (let row = 0; row < gridHeight; row += 1) {
    const top = yEdges[row];
    const bottom = Math.max(yEdges[row + 1], top + 1);
    for (let column = 0; column < gridWidth; column += 1) {
      const left = xEdges[column];
      const right = Math.max(xEdges[column + 1], left + 1);
      const realisticRepresentative = weightedAveragePixelFromPatch(image, left, top, right, bottom);
      const pixelArtRepresentative =
        strategy === "chart-edge"
          ? representativePixelFromChartPatch(image, left, top, right, bottom)
          : representativePixelFromPatch(image, left, top, right, bottom);
      const representative = blendRepresentativePixels(
        realisticRepresentative,
        pixelArtRepresentative,
        pixelArtBias,
      );
      const index = (row * gridWidth + column) * 4;
      data[index] = representative.rgb[0];
      data[index + 1] = representative.rgb[1];
      data[index + 2] = representative.rgb[2];
      data[index + 3] = representative.alpha;
    }
  }

  return { width: gridWidth, height: gridHeight, data };
}

function sampleFixedSquareGrid(
  image: RasterImage,
  gridWidth: number,
  gridHeight: number,
  cellSize: number,
  gap: number,
  pixelArtBias = 1,
): RasterImage {
  const pitch = cellSize + gap;
  const data = new Uint8ClampedArray(gridWidth * gridHeight * 4);

  for (let row = 0; row < gridHeight; row += 1) {
    const top = row * pitch;
    const bottom = Math.min(image.height, top + cellSize);
    for (let column = 0; column < gridWidth; column += 1) {
      const left = column * pitch;
      const right = Math.min(image.width, left + cellSize);
      const representative = blendRepresentativePixels(
        weightedAveragePixelFromPatch(image, left, top, right, bottom),
        representativePixelFromPatch(image, left, top, right, bottom),
        pixelArtBias,
      );
      const index = (row * gridWidth + column) * 4;
      data[index] = representative.rgb[0];
      data[index + 1] = representative.rgb[1];
      data[index + 2] = representative.rgb[2];
      data[index + 3] = representative.alpha;
    }
  }

  return { width: gridWidth, height: gridHeight, data };
}

async function convertImageToLogicalGrid(
  image: RasterImage,
  gridWidth: number,
  gridHeight: number,
  preSharpenEnabled: boolean,
  preSharpenStrength: number,
  fftEdgeEnhanceEnabled: boolean,
  fftEdgeEnhanceStrength: number,
  samplingStrategy: SamplingStrategy = "patch",
  pixelArtBias = 1,
) {
  let cropped = centerCropToRatio(image, gridWidth / gridHeight);
  if (fftEdgeEnhanceEnabled) {
    cropped = (await enhanceEdgesWithFftWasm(cropped, fftEdgeEnhanceStrength)) as RasterImage;
  }
  if (preSharpenEnabled) {
    cropped = applySharpen(cropped, preSharpenStrength);
  }
  return sampleRegularGrid(cropped, gridWidth, gridHeight, samplingStrategy, pixelArtBias);
}

function centerCropToRatio(image: RasterImage, targetRatio: number) {
  const currentRatio = image.width / image.height;
  if (Math.abs(currentRatio - targetRatio) < 1e-6) {
    return image;
  }

  if (currentRatio > targetRatio) {
    const newWidth = Math.round(image.height * targetRatio);
    const left = Math.floor((image.width - newWidth) / 2);
    return cropRaster(image, [left, 0, left + newWidth, image.height]);
  }

  const newHeight = Math.round(image.width / targetRatio);
  const top = Math.floor((image.height - newHeight) / 2);
  return cropRaster(image, [0, top, image.width, top + newHeight]);
}

function findClosestPaletteColor(rgb: Rgb, paletteDefinition: PaletteDefinition) {
  const oklab = rgbToOklab(rgb);
  let best = paletteDefinition.colors[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const paletteColor of paletteDefinition.colors) {
    const distance = oklabDistanceSquared(oklab, paletteColor.oklab);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = paletteColor;
    }
  }
  return best;
}

function matchPaletteNearest(logical: RasterImage, paletteDefinition: PaletteDefinition) {
  const cells: EditableCell[] = [];

  for (let index = 0; index < logical.width * logical.height; index += 1) {
    const pixelIndex = index * 4;
    if (logical.data[pixelIndex + 3] < MIN_MATCHABLE_CELL_ALPHA) {
      cells.push({ label: null, hex: null, source: null });
      continue;
    }
    const rgb: Rgb = [
      logical.data[pixelIndex],
      logical.data[pixelIndex + 1],
      logical.data[pixelIndex + 2],
    ];
    const best = findClosestPaletteColor(rgb, paletteDefinition);

    cells.push(normalizeEditableCell({
      label: best.label,
      hex: best.hex,
      source: "detected",
    }));
  }

  return { cells };
}

function matchPaletteWithErrorDiffusion(
  logical: RasterImage,
  paletteDefinition: PaletteDefinition,
  ditherStrength = 1,
) {
  const width = logical.width;
  const height = logical.height;
  const cells: EditableCell[] = new Array(width * height);
  const working = new Float32Array(logical.data.length);
  const clampedDitherStrength = Math.max(0, Math.min(1, ditherStrength));
  for (let index = 0; index < logical.data.length; index += 1) {
    working[index] = logical.data[index];
  }

  function diffuseError(
    x: number,
    y: number,
    redError: number,
    greenError: number,
    blueError: number,
    factor: number,
  ) {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }

    const pixelIndex = (y * width + x) * 4;
    if (logical.data[pixelIndex + 3] < MIN_MATCHABLE_CELL_ALPHA) {
      return;
    }

    const scaledFactor = factor * clampedDitherStrength;
    working[pixelIndex] += redError * scaledFactor;
    working[pixelIndex + 1] += greenError * scaledFactor;
    working[pixelIndex + 2] += blueError * scaledFactor;
  }

  for (let row = 0; row < height; row += 1) {
    const serpentine = row % 2 === 1;
    const startX = serpentine ? width - 1 : 0;
    const endX = serpentine ? -1 : width;
    const stepX = serpentine ? -1 : 1;

    for (let column = startX; column !== endX; column += stepX) {
      const pixelIndex = (row * width + column) * 4;
      if (logical.data[pixelIndex + 3] < MIN_MATCHABLE_CELL_ALPHA) {
        cells[row * width + column] = { label: null, hex: null, source: null };
        continue;
      }

      const current: Rgb = [
        clampToByte(working[pixelIndex]),
        clampToByte(working[pixelIndex + 1]),
        clampToByte(working[pixelIndex + 2]),
      ];
      const best = findClosestPaletteColor(current, paletteDefinition);
      cells[row * width + column] = normalizeEditableCell({
        label: best.label,
        hex: best.hex,
        source: "detected",
      });

      const redError = working[pixelIndex] - best.rgb[0];
      const greenError = working[pixelIndex + 1] - best.rgb[1];
      const blueError = working[pixelIndex + 2] - best.rgb[2];
      const forwardX = column + stepX;
      diffuseError(forwardX, row, redError, greenError, blueError, 7 / 16);
      diffuseError(column - stepX, row + 1, redError, greenError, blueError, 3 / 16);
      diffuseError(column, row + 1, redError, greenError, blueError, 5 / 16);
      diffuseError(forwardX, row + 1, redError, greenError, blueError, 1 / 16);
    }
  }

  return { cells: cells.map((cell) => cell ?? { label: null, hex: null, source: null }) };
}

function matchPalette(
  logical: RasterImage,
  paletteDefinition: PaletteDefinition,
  options: { ditherStrength?: number } = {},
) {
  const ditherStrength = Math.max(0, Math.min(1, options.ditherStrength ?? 0));
  return ditherStrength > 0.001
    ? matchPaletteWithErrorDiffusion(logical, paletteDefinition, ditherStrength)
    : matchPaletteNearest(logical, paletteDefinition);
}

export function enhancePixelOutlineContinuity(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
  strength = 30,
  overrideCell: EditableCell | null = null,
) {
  const normalizedCells = cells.map((cell) => normalizeEditableCell(cell));
  if (gridWidth <= 0 || gridHeight <= 0 || normalizedCells.length !== gridWidth * gridHeight) {
    return normalizedCells;
  }

  const strengthNorm = Math.max(0, Math.min(100, strength)) / 100;
  const passes = 1;
  const normalizedOverrideCell =
    overrideCell?.label && overrideCell.hex
      ? normalizeEditableCell({ ...overrideCell, source: "detected" })
      : null;
  let current = normalizedCells.map((cell) => ({ ...cell }));

  for (let pass = 0; pass < passes; pass += 1) {
    const tones = current.map((cell) => getCellTone(cell));
    const outlineSeedMask = buildOutlineSeedMask(
      current,
      tones,
      gridWidth,
      gridHeight,
      strengthNorm,
    );
    const next = current.map((cell) => ({ ...cell }));
    let changed = false;

    if (normalizedOverrideCell) {
      for (let index = 0; index < current.length; index += 1) {
        if (!outlineSeedMask[index]) {
          continue;
        }
        if (
          next[index].label === normalizedOverrideCell.label &&
          next[index].hex === normalizedOverrideCell.hex
        ) {
          continue;
        }
        next[index] = { ...normalizedOverrideCell, source: "detected" };
        changed = true;
      }
    }

    for (let index = 0; index < current.length; index += 1) {
      if (outlineSeedMask[index]) {
        continue;
      }

      const currentTone = tones[index];
      if (!currentTone) {
        continue;
      }

      const candidate = findOutlineBridgeCandidate(
        current,
        tones,
        outlineSeedMask,
        gridWidth,
        gridHeight,
        index,
        strengthNorm,
      );
      if (!candidate) {
        continue;
      }

      const candidateTone = tones[candidate.index];
      if (!candidateTone) {
        continue;
      }

      if (
        wouldBridgeCreateWideOutline(
          current,
          gridWidth,
          gridHeight,
          index,
          candidate.cell.label,
          candidate.mode,
        )
      ) {
        continue;
      }

      const minimumContrast = 12 + (1 - strengthNorm) * 8;
      if (currentTone.luma <= candidateTone.luma + minimumContrast) {
        continue;
      }

      const fillCell = normalizedOverrideCell ?? candidate.cell;
      if (current[index].label === fillCell.label && current[index].hex === fillCell.hex) {
        continue;
      }

      next[index] = { ...fillCell, source: "detected" };
      changed = true;
    }

    current = next;
    if (!changed) {
      break;
    }
  }

  return current;
}

function buildOutlineSeedMask(
  cells: EditableCell[],
  tones: Array<CellTone | null>,
  gridWidth: number,
  gridHeight: number,
  strengthNorm: number,
) {
  const mask = new Uint8Array(cells.length);
  const localContrastThreshold = 18 - strengthNorm * 4;
  const absoluteDarkThreshold = 176 - strengthNorm * 24;

  for (let index = 0; index < cells.length; index += 1) {
    const tone = tones[index];
    const cell = cells[index];
    if (!tone || !cell.label) {
      continue;
    }

    const x = index % gridWidth;
    const y = Math.floor(index / gridWidth);
    let brightNeighborCount = 0;
    let sameLabelSupport = 0;

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }

        const neighborX = x + dx;
        const neighborY = y + dy;
        if (
          neighborX < 0 ||
          neighborY < 0 ||
          neighborX >= gridWidth ||
          neighborY >= gridHeight
        ) {
          continue;
        }

        const neighborIndex = neighborY * gridWidth + neighborX;
        const neighborCell = cells[neighborIndex];
        const neighborTone = tones[neighborIndex];
        if (!neighborTone || !neighborCell.label) {
          continue;
        }

        if (neighborCell.label === cell.label) {
          sameLabelSupport += 1;
          continue;
        }

        if (neighborTone.luma >= tone.luma + localContrastThreshold) {
          brightNeighborCount += 1;
        }
      }
    }

    if (
      sameLabelSupport >= 1 &&
      (brightNeighborCount >= 2 ||
        (brightNeighborCount >= 1 && tone.luma <= absoluteDarkThreshold))
    ) {
      mask[index] = 1;
    }
  }

  return mask;
}

function findOutlineBridgeCandidate(
  cells: EditableCell[],
  tones: Array<CellTone | null>,
  outlineSeedMask: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  index: number,
  strengthNorm: number,
): OutlineBridgeCandidate | null {
  const x = index % gridWidth;
  const y = Math.floor(index / gridWidth);
  let best: OutlineBridgeCandidate | null = null;

  function addCandidate(
    leftIndex: number | null,
    rightIndex: number | null,
    support: number,
    mode: "horizontal" | "vertical" | "diag-desc" | "diag-asc",
  ) {
    if (
      leftIndex === null ||
      rightIndex === null ||
      !outlineSeedMask[leftIndex] ||
      !outlineSeedMask[rightIndex]
    ) {
      return;
    }

    const leftCell = cells[leftIndex];
    const rightCell = cells[rightIndex];
    const leftTone = tones[leftIndex];
    const rightTone = tones[rightIndex];
    if (
      !leftCell.label ||
      !rightCell.label ||
      leftCell.label !== rightCell.label ||
      !leftTone ||
      !rightTone
    ) {
      return;
    }

    const candidateIndex = leftTone.luma <= rightTone.luma ? leftIndex : rightIndex;
    const candidateTone = tones[candidateIndex]!;
    const candidateCell = cells[candidateIndex];
    if (
      !best ||
      support > best.support ||
      (support === best.support && candidateTone.luma < best.luma)
    ) {
      best = {
        support,
        index: candidateIndex,
        luma: candidateTone.luma,
        cell: candidateCell,
        mode,
      };
    }
  }

  const straightPairs: Array<[
    [number, number],
    [number, number],
    number,
    "horizontal" | "vertical" | "diag-desc" | "diag-asc",
  ]> = [
    [[-1, 0], [1, 0], 4, "horizontal"],
    [[0, -1], [0, 1], 4, "vertical"],
  ];
  if (strengthNorm >= 0.35) {
    straightPairs.push(
      [[-1, -1], [1, 1], 3, "diag-desc"],
      [[1, -1], [-1, 1], 3, "diag-asc"],
    );
  }

  for (const [leftOffset, rightOffset, support, mode] of straightPairs) {
    addCandidate(
      getGridNeighborIndex(x, y, leftOffset[0], leftOffset[1], gridWidth, gridHeight),
      getGridNeighborIndex(x, y, rightOffset[0], rightOffset[1], gridWidth, gridHeight),
      support,
      mode,
    );
  }
  return best;
}

function wouldBridgeCreateWideOutline(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
  index: number,
  label: string | null,
  mode: "horizontal" | "vertical" | "diag-desc" | "diag-asc",
) {
  if (!label) {
    return true;
  }

  const x = index % gridWidth;
  const y = Math.floor(index / gridWidth);

  const hasSameLabelAt = (dx: number, dy: number) => {
    const neighborIndex = getGridNeighborIndex(x, y, dx, dy, gridWidth, gridHeight);
    return neighborIndex !== null && cells[neighborIndex]?.label === label;
  };

  if (mode === "horizontal") {
    return hasSameLabelAt(0, -1) || hasSameLabelAt(0, 1);
  }
  if (mode === "vertical") {
    return hasSameLabelAt(-1, 0) || hasSameLabelAt(1, 0);
  }

  return (
    hasSameLabelAt(-1, 0) ||
    hasSameLabelAt(1, 0) ||
    hasSameLabelAt(0, -1) ||
    hasSameLabelAt(0, 1)
  );
}

function getGridNeighborIndex(
  x: number,
  y: number,
  dx: number,
  dy: number,
  gridWidth: number,
  gridHeight: number,
) {
  const nextX = x + dx;
  const nextY = y + dy;
  if (nextX < 0 || nextY < 0 || nextX >= gridWidth || nextY >= gridHeight) {
    return null;
  }
  return nextY * gridWidth + nextX;
}

function getCellTone(cell: EditableCell): CellTone | null {
  if (!cell.hex) {
    return null;
  }

  const rgb = hexToRgb(cell.hex);
  return {
    rgb,
    luma: rgbToGray(rgb),
  };
}

export function reduceColorsPhotoshopStyle(
  image: RasterImage,
  tolerance: number,
  options: ReduceColorsOptions = {},
) {
  const indexByColor = new Map<number, number>();
  const uniqueColors: Rgb[] = [];
  const counts: number[] = [];
  const pixelCount = image.width * image.height;
  const inverse = new Int32Array(pixelCount);
  const preserveEdges = options.preserveEdges ?? false;

  for (let index = 0; index < pixelCount; index += 1) {
    const pixelIndex = index * 4;
    if (image.data[pixelIndex + 3] < MIN_VISIBLE_PIXEL_ALPHA) {
      inverse[index] = -1;
      continue;
    }
    const code =
      (image.data[pixelIndex] << 16) |
      (image.data[pixelIndex + 1] << 8) |
      image.data[pixelIndex + 2];
    let colorIndex = indexByColor.get(code);
    if (colorIndex === undefined) {
      colorIndex = uniqueColors.length;
      indexByColor.set(code, colorIndex);
      uniqueColors.push([
        image.data[pixelIndex],
        image.data[pixelIndex + 1],
        image.data[pixelIndex + 2],
      ]);
      counts.push(0);
    }
    counts[colorIndex] += 1;
    inverse[index] = colorIndex;
  }

  const originalUniqueColors = uniqueColors.length;
  if (tolerance <= 0 || originalUniqueColors <= 1) {
    return { image, originalUniqueColors, reducedUniqueColors: originalUniqueColors };
  }

  const rareColorLimit = getRareColorPixelLimit(pixelCount);
  const oklabByColor = uniqueColors.map((color) => rgbToOklab(color));
  const replacementByColor = new Int32Array(originalUniqueColors);
  const similarNeighborThreshold = Math.max(4, tolerance * 0.65);
  for (let index = 0; index < originalUniqueColors; index += 1) {
    replacementByColor[index] = index;
  }

  for (let colorIndex = 0; colorIndex < originalUniqueColors; colorIndex += 1) {
    const currentCount = counts[colorIndex] ?? 0;
    if (currentCount <= 0 || currentCount > rareColorLimit) {
      continue;
    }

    let bestReplacement = colorIndex;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestCount = -1;
    for (let candidateIndex = 0; candidateIndex < originalUniqueColors; candidateIndex += 1) {
      if (candidateIndex === colorIndex) {
        continue;
      }

      const candidateCount = counts[candidateIndex] ?? 0;
      if (candidateCount <= rareColorLimit) {
        continue;
      }

      const distance =
        Math.sqrt(oklabDistanceSquared(oklabByColor[colorIndex], oklabByColor[candidateIndex])) *
        255;
      if (distance > tolerance) {
        continue;
      }

      if (
        distance < bestDistance ||
        (distance === bestDistance && candidateCount > bestCount)
      ) {
        bestReplacement = candidateIndex;
        bestDistance = distance;
        bestCount = candidateCount;
      }
    }

    replacementByColor[colorIndex] = bestReplacement;
  }

  const data = new Uint8ClampedArray(image.data.length);
  for (let index = 0; index < pixelCount; index += 1) {
    const pixelIndex = index * 4;
    const colorIndex = inverse[index];
    if (colorIndex < 0) {
      data[pixelIndex] = image.data[pixelIndex];
      data[pixelIndex + 1] = image.data[pixelIndex + 1];
      data[pixelIndex + 2] = image.data[pixelIndex + 2];
      data[pixelIndex + 3] = image.data[pixelIndex + 3];
      continue;
    }
    const replacementIndex =
      preserveEdges &&
      replacementByColor[colorIndex] !== colorIndex &&
      hasSupportingSimilarNeighbor(
        inverse,
        image.width,
        image.height,
        index,
        oklabByColor[colorIndex],
        (candidateIndex) => oklabByColor[candidateIndex]!,
        similarNeighborThreshold,
        (candidateIndex) => (counts[candidateIndex] ?? 0) <= rareColorLimit,
      )
        ? colorIndex
        : replacementByColor[colorIndex];
    const replacement = uniqueColors[replacementIndex];
    data[pixelIndex] = replacement[0];
    data[pixelIndex + 1] = replacement[1];
    data[pixelIndex + 2] = replacement[2];
    data[pixelIndex + 3] = image.data[pixelIndex + 3];
  }

  const globallyReducedImage = {
    width: image.width,
    height: image.height,
    data,
  };
  const neighborhoodReducedImage = mergeRareNeighborhoodColors(
    globallyReducedImage,
    tolerance,
    rareColorLimit,
    options,
  );

  return {
    image: neighborhoodReducedImage,
    originalUniqueColors,
    reducedUniqueColors: countUniqueColors(neighborhoodReducedImage.data),
  };
}

function mergeRareNeighborhoodColors(
  image: RasterImage,
  tolerance: number,
  rareColorLimit = 2,
  options: ReduceColorsOptions = {},
) {
  if (tolerance <= 0 || image.width <= 0 || image.height <= 0) {
    return image;
  }

  const pixelCount = image.width * image.height;
  const codes = new Int32Array(pixelCount);
  const counts = new Map<number, number>();
  for (let index = 0; index < pixelCount; index += 1) {
    const pixelIndex = index * 4;
    if (image.data[pixelIndex + 3] < MIN_VISIBLE_PIXEL_ALPHA) {
      codes[index] = -1;
      continue;
    }
    const code =
      (image.data[pixelIndex] << 16) |
      (image.data[pixelIndex + 1] << 8) |
      image.data[pixelIndex + 2];
    codes[index] = code;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  const oklabCache = new Map<number, Oklab>();
  function getCodeOklab(code: number) {
    let cached = oklabCache.get(code);
    if (cached) {
      return cached;
    }

    cached = rgbToOklab(codeToRgb(code));
    oklabCache.set(code, cached);
    return cached;
  }

  const nextData = new Uint8ClampedArray(image.data);
  let changed = false;
  const preserveEdges = options.preserveEdges ?? false;
  const similarNeighborThreshold = Math.max(4, tolerance * 0.65);

  for (let index = 0; index < pixelCount; index += 1) {
    const currentCode = codes[index];
    if (currentCode < 0) {
      continue;
    }
    const currentCount = counts.get(currentCode) ?? 0;
    if (currentCount <= 0 || currentCount > rareColorLimit) {
      continue;
    }

    const currentOklab = getCodeOklab(currentCode);
    if (
      preserveEdges &&
      hasSupportingSimilarNeighbor(
        codes,
        image.width,
        image.height,
        index,
        currentOklab,
        getCodeOklab,
        similarNeighborThreshold,
        (neighborCode) => (counts.get(neighborCode) ?? 0) <= rareColorLimit,
      )
    ) {
      continue;
    }

    const x = index % image.width;
    const y = Math.floor(index / image.width);
    const neighborWeights = new Map<number, number>();

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }

        const neighborX = x + dx;
        const neighborY = y + dy;
        if (
          neighborX < 0 ||
          neighborY < 0 ||
          neighborX >= image.width ||
          neighborY >= image.height
        ) {
          continue;
        }

        const neighborCode = codes[neighborY * image.width + neighborX];
        if (neighborCode < 0 || neighborCode === currentCode) {
          continue;
        }

        const weight = dx === 0 || dy === 0 ? 2 : 1;
        neighborWeights.set(
          neighborCode,
          (neighborWeights.get(neighborCode) ?? 0) + weight,
        );
      }
    }

    let bestCode = -1;
    let bestNeighborWeight = -1;
    let bestGlobalCount = -1;
    for (const [neighborCode, neighborWeight] of neighborWeights) {
      const neighborCount = counts.get(neighborCode) ?? 0;
      if (neighborCount <= currentCount) {
        continue;
      }

      if (
        neighborWeight > bestNeighborWeight ||
        (neighborWeight === bestNeighborWeight && neighborCount > bestGlobalCount)
      ) {
        bestCode = neighborCode;
        bestNeighborWeight = neighborWeight;
        bestGlobalCount = neighborCount;
      }
    }

    if (bestCode === -1) {
      continue;
    }

    const candidateOklab = getCodeOklab(bestCode);
    const distance = Math.sqrt(oklabDistanceSquared(currentOklab, candidateOklab)) * 255;
    if (distance > tolerance) {
      continue;
    }

    const pixelIndex = index * 4;
    const replacement = codeToRgb(bestCode);
    nextData[pixelIndex] = replacement[0];
    nextData[pixelIndex + 1] = replacement[1];
    nextData[pixelIndex + 2] = replacement[2];
    nextData[pixelIndex + 3] = image.data[pixelIndex + 3];
    changed = true;
  }

  return changed
    ? {
        width: image.width,
        height: image.height,
        data: nextData,
      }
    : image;
}

function hasSupportingSimilarNeighbor(
  codes: Int32Array,
  width: number,
  height: number,
  index: number,
  currentOklab: Oklab,
  getCodeOklab: (code: number) => Oklab,
  threshold: number,
  isSupportingCode?: (code: number) => boolean,
) {
  const x = index % width;
  const y = Math.floor(index / width);

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const neighborX = x + dx;
      const neighborY = y + dy;
      if (neighborX < 0 || neighborY < 0 || neighborX >= width || neighborY >= height) {
        continue;
      }

      const neighborCode = codes[neighborY * width + neighborX];
      if (neighborCode < 0) {
        continue;
      }
      if (isSupportingCode && !isSupportingCode(neighborCode)) {
        continue;
      }
      const distance =
        Math.sqrt(oklabDistanceSquared(currentOklab, getCodeOklab(neighborCode))) * 255;
      if (distance <= threshold) {
        return true;
      }
    }
  }

  return false;
}

function getRareColorPixelLimit(pixelCount: number) {
  return Math.max(2, Math.min(8, Math.round(pixelCount * 0.0015)));
}

function chooseCellSize(gridWidth: number, gridHeight: number, requested?: number) {
  if (requested && requested > 0) {
    return requested;
  }

  const largest = Math.max(gridWidth, gridHeight);
  if (largest <= 40) {
    return 48;
  }
  if (largest <= 64) {
    return 36;
  }
  if (largest <= 96) {
    return 28;
  }
  if (largest <= 128) {
    return 22;
  }
  return 18;
}

function buildExportAxisLabelPositions(gridCount: number) {
  const labels: Array<{ index: number; value: number }> = [];
  for (let index = 0; index < gridCount; index += 1) {
    const value = index + 1;
    if (value % 5 === 0) {
      labels.push({ index, value });
    }
  }
  return labels;
}

function drawExportGuideLines(
  context: CanvasRenderingContext2D,
  boardX: number,
  boardY: number,
  boardWidth: number,
  boardHeight: number,
  gridWidth: number,
  gridHeight: number,
  cellSize: number,
) {
  const lineWidth = Math.max(1.5, cellSize * 0.085);
  const minorLineWidth = Math.max(1.15, lineWidth * 0.8);
  const dashLength = Math.max(4, Math.floor(cellSize * 0.3));
  const gapLength = Math.max(6, Math.floor(cellSize * 0.42));

  context.save();
  context.lineCap = "butt";

  for (let index = 5; index < gridWidth; index += 5) {
    context.beginPath();
    const isMajorLine = index % 10 === 0;
    context.strokeStyle = isMajorLine ? "#000000" : "rgba(0, 0, 0, 0.5)";
    context.lineWidth = isMajorLine ? lineWidth : minorLineWidth;
    context.setLineDash(isMajorLine ? [] : [dashLength, gapLength]);
    const x = boardX + index * cellSize;
    context.moveTo(x, boardY);
    context.lineTo(x, boardY + boardHeight);
    context.stroke();
  }

  for (let index = 5; index < gridHeight; index += 5) {
    context.beginPath();
    const isMajorLine = index % 10 === 0;
    context.strokeStyle = isMajorLine ? "#000000" : "rgba(0, 0, 0, 0.5)";
    context.lineWidth = isMajorLine ? lineWidth : minorLineWidth;
    context.setLineDash(isMajorLine ? [] : [dashLength, gapLength]);
    const y = boardY + index * cellSize;
    context.moveTo(boardX, y);
    context.lineTo(boardX + boardWidth, y);
    context.stroke();
  }

  context.restore();
}

function drawExportAxisLabels(
  context: CanvasRenderingContext2D,
  boardX: number,
  boardY: number,
  gridWidth: number,
  gridHeight: number,
  cellSize: number,
  axisGutter: number,
  axisLabelFontSize: number,
) {
  context.save();
  context.font = buildFont(axisLabelFontSize, true, false);
  context.fillStyle = "#111111";
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const label of buildExportAxisLabelPositions(gridWidth)) {
    context.fillText(
      String(label.value),
      boardX + (label.index + 0.5) * cellSize,
      boardY - axisGutter * 0.45,
    );
  }

  for (const label of buildExportAxisLabelPositions(gridHeight)) {
    context.fillText(
      String(label.value),
      boardX - axisGutter * 0.45,
      boardY + (label.index + 0.5) * cellSize,
    );
  }

  context.restore();
}

function drawExportBoardPattern(
  context: CanvasRenderingContext2D,
  boardX: number,
  boardY: number,
  gridWidth: number,
  gridHeight: number,
  cellSize: number,
  cellGap: number,
  boardTheme: PindouBoardTheme,
) {
  const shades = getPindouBoardThemeShades(boardTheme);
  const pattern = [
    [0, 1, 1, 0],
    [1, 2, 2, 1],
    [1, 2, 2, 1],
    [0, 1, 1, 0],
  ] as const;
  const blockSpan = 5;

  context.fillStyle = shades[1];
  context.fillRect(boardX, boardY, gridWidth * cellSize, gridHeight * cellSize);

  for (let blockRow = 0; blockRow * blockSpan < gridHeight; blockRow += 1) {
    for (let blockColumn = 0; blockColumn * blockSpan < gridWidth; blockColumn += 1) {
      const startColumn = blockColumn * blockSpan;
      const startRow = blockRow * blockSpan;
      const endColumn = Math.min(gridWidth, startColumn + blockSpan);
      const endRow = Math.min(gridHeight, startRow + blockSpan);
      const x = boardX + startColumn * cellSize;
      const y = boardY + startRow * cellSize;
      const width = (endColumn - startColumn) * cellSize - cellGap;
      const height = (endRow - startRow) * cellSize - cellGap;
      context.fillStyle = shades[pattern[blockRow % 4][blockColumn % 4]];
      context.fillRect(x, y, width, height);
    }
  }
}

function getExportBoardPatternColor(
  boardTheme: PindouBoardTheme,
  column: number,
  row: number,
) {
  const shades = getPindouBoardThemeShades(boardTheme);
  const pattern = [
    [0, 1, 1, 0],
    [1, 2, 2, 1],
    [1, 2, 2, 1],
    [0, 1, 1, 0],
  ] as const;
  return shades[pattern[Math.floor(row / 5) % 4][Math.floor(column / 5) % 4]];
}

export function getChartCellGap(cellSize: number, gaplessCells = false) {
  return gaplessCells ? 0 : Math.max(1, Math.floor(cellSize / 18));
}

export function getChartFrameWidth(cellSize: number, gaplessCells = false) {
  return gaplessCells ? 0 : Math.max(4, Math.floor(cellSize / 7));
}

export function shouldShowChartColorLabels(showColorLabels?: boolean) {
  return showColorLabels ?? true;
}

export function shouldShowChartHeaderDetails(gaplessCells = false) {
  return !gaplessCells;
}

async function renderChart(
  cells: EditableCell[],
  colors: ColorCount[],
  gridWidth: number,
  gridHeight: number,
  cellSize: number,
  title: string,
  metaLine: string,
  canvasContextUnavailableMessage: string,
  chartQrTooLargeMessage: string,
  chartQrCaptionMessage: string,
  chartSettings?: ChartExportSettings,
) {
  const includeGuides = chartSettings?.includeGuides ?? true;
  const includeLegend = chartSettings?.includeLegend ?? true;
  const includeQrCode = chartSettings?.includeQrCode ?? false;
  const showColorLabels = shouldShowChartColorLabels(chartSettings?.showColorLabels);
  const gaplessCells = chartSettings?.gaplessCells ?? false;
  const showHeaderDetails = shouldShowChartHeaderDetails(gaplessCells);
  const includeBoardPattern = chartSettings?.includeBoardPattern ?? false;
  const boardTheme = chartSettings?.boardTheme ?? "gray";
  const cellGap = getChartCellGap(cellSize, gaplessCells);
  const frame = getChartFrameWidth(cellSize, gaplessCells);
  const axisGutter = includeGuides ? Math.max(26, Math.floor(cellSize * 0.92)) : 0;
  const boardWidth = gridWidth * cellSize;
  const boardHeight = gridHeight * cellSize;
  const boardBlockWidth = boardWidth + frame * 2 + axisGutter;
  const boardBlockHeight = boardHeight + frame * 2 + axisGutter;
  const canvasPadding = Math.max(24, cellSize);
  const titleGap = Math.max(16, Math.floor(cellSize / 2));

  const labelFontSize = Math.max(10, Math.floor(cellSize * 0.34));
  const axisLabelFontSize = Math.max(11, Math.floor(cellSize * 0.34));
  const brandFontSize = Math.max(28, Math.floor(cellSize * 0.82));
  const titleFontSize = Math.max(19, Math.floor(cellSize * 0.56));
  const metaFontSize = Math.max(15, Math.floor(cellSize * 0.4));
  const legendLabelFontSize = Math.max(14, Math.floor(cellSize * 0.4));
  const legendCountFontSize = Math.max(14, Math.floor(cellSize * 0.35));
  const logoSize = Math.max(42, Math.floor(cellSize * 1.34));
  const brandRowHeight = Math.max(logoSize, brandFontSize) + 16;
  const metaRowHeight =
    showHeaderDetails && metaLine
      ? metaFontSize + Math.max(12, Math.floor(cellSize * 0.24))
      : 0;
  const headerSectionHeight = showHeaderDetails
    ? titleGap + titleFontSize + metaRowHeight + titleGap
    : Math.max(16, Math.floor(cellSize * 0.5));

  const legendTileWidth = Math.max(88, Math.floor(cellSize * 2.08));
  const legendSwatchHeight = Math.max(46, Math.floor(cellSize * 1.08));
  const legendTileHeight = legendSwatchHeight + Math.max(30, Math.floor(cellSize * 0.82));
  const legendGap = Math.max(10, Math.floor(cellSize / 4));
  const qrCardPadding = Math.max(24, Math.floor(cellSize * 0.64));
  const baseQrSize = includeQrCode ? getBaseChartQrSize(cellSize) : 0;
  const qrCaption = chartQrCaptionMessage.trim();
  const qrCaptionFontSize = includeQrCode ? Math.max(15, Math.floor(cellSize * 0.46)) : 0;
  const qrCaptionGap = qrCaption ? Math.max(12, Math.floor(cellSize * 0.34)) : 0;
  const qrCaptionBlockHeight = qrCaption ? qrCaptionFontSize + qrCaptionGap : 0;

  const baseCanvasWidth = Math.max(boardBlockWidth + canvasPadding * 2, 900);
  const itemsPerRow = Math.max(
    1,
    Math.floor((baseCanvasWidth - canvasPadding * 2 + legendGap) / (legendTileWidth + legendGap)),
  );
  const legendRows = Math.max(1, Math.ceil(colors.length / itemsPerRow));
  const legendHeight =
    legendRows * legendTileHeight + Math.max(0, legendRows - 1) * legendGap;
  const legendSectionHeight = includeLegend ? legendHeight : 0;
  const legendSectionGap = includeLegend ? titleGap : 0;
  const baseCanvasHeight =
    canvasPadding +
    brandRowHeight +
    headerSectionHeight +
    boardBlockHeight +
    legendSectionGap +
    legendSectionHeight +
    canvasPadding;
  const preferredBoardQrSize = includeQrCode
    ? Math.max(
        baseQrSize,
        getMinimumQrSizeForSnsReadable(baseCanvasWidth, baseCanvasHeight),
      )
    : 0;
  const tentativeQrBoardPlacement =
    includeQrCode && chartSettings?.shareUrl
      ? findChartQrBoardPlacement(
          cells,
          gridWidth,
          gridHeight,
          cellSize,
          preferredBoardQrSize,
          qrCaptionBlockHeight,
        )
      : null;
  const qrBoardPlacement =
    tentativeQrBoardPlacement &&
    tentativeQrBoardPlacement.qrSize *
      getChartSnsDisplayScale(baseCanvasWidth, baseCanvasHeight) >=
      MIN_SNS_DISPLAY_QR_SIZE
      ? tentativeQrBoardPlacement
      : null;
  const renderQrBelowBoard = includeQrCode && !qrBoardPlacement;
  const qrSize =
    includeQrCode && renderQrBelowBoard
      ? resolveResponsiveChartQrSize({
          cellSize,
          canvasPadding,
          qrCardPadding,
          qrCaptionBlockHeight,
          qrSectionGap: titleGap,
          baseCanvasWidth,
          baseCanvasHeight,
        })
      : 0;
  const qrCardWidth =
    qrSize > 0 && renderQrBelowBoard
      ? getBelowBoardQrCardWidth(cellSize, qrSize, qrCardPadding)
      : 0;
  const qrCardHeight =
    qrSize > 0 && renderQrBelowBoard
      ? getBelowBoardQrCardHeight(qrSize, qrCardPadding, qrCaptionBlockHeight)
      : 0;
  const qrSectionHeight = renderQrBelowBoard ? qrCardHeight : 0;
  const qrSectionGap = renderQrBelowBoard ? titleGap : 0;

  const canvasWidth = Math.max(
    baseCanvasWidth,
    itemsPerRow * legendTileWidth + Math.max(0, itemsPerRow - 1) * legendGap + canvasPadding * 2,
    qrCardWidth + canvasPadding * 2,
  );
  const canvasHeight = baseCanvasHeight + qrSectionGap + qrSectionHeight;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(canvasContextUnavailableMessage);
  }

  context.fillStyle = CANVAS_BACKGROUND;
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.textAlign = "left";
  context.textBaseline = "middle";
  const brandRowY = canvasPadding + brandRowHeight / 2;
  const wordmarkHeight = Math.max(logoSize * 0.9, brandFontSize + 8);
  const wordmarkWidth = measureBrandWordmarkWidth(wordmarkHeight);
  const brandBlockWidth = wordmarkWidth + logoSize + 18;
  const brandStartX = Math.round((canvasWidth - brandBlockWidth) / 2);
  drawBrandLogo(context, brandStartX, brandRowY - logoSize / 2, logoSize);
  await drawBrandWordmark(context, brandStartX + logoSize + 18, brandRowY, wordmarkHeight);

  if (showHeaderDetails) {
    context.textAlign = "center";
    context.fillStyle = "#2C2C2C";
    context.font = buildFont(titleFontSize, true, true);
    context.fillText(
      title,
      canvasWidth / 2,
      canvasPadding + brandRowHeight + titleGap + titleFontSize / 2,
    );

    if (metaLine) {
      context.font = buildFont(metaFontSize, false, false);
      context.fillStyle = "#5E5346";
      context.fillText(
        metaLine,
        canvasWidth / 2,
        canvasPadding + brandRowHeight + titleGap + titleFontSize + metaFontSize / 2 + 8,
      );
    }
  }
  context.textAlign = "center";

  const boardBlockX = Math.floor((canvasWidth - boardBlockWidth) / 2);
  const boardBlockY = canvasPadding + brandRowHeight + headerSectionHeight;
  const boardOuterX = boardBlockX + axisGutter;
  const boardOuterY = boardBlockY + axisGutter;
  const boardInnerX = boardOuterX + frame;
  const boardInnerY = boardOuterY + frame;

  if (frame > 0) {
    context.fillStyle = BOARD_FRAME_COLOR;
    context.fillRect(boardOuterX, boardOuterY, boardWidth + frame * 2, boardHeight + frame * 2);
  }

  if (includeBoardPattern) {
    drawExportBoardPattern(
      context,
      boardInnerX,
      boardInnerY,
      gridWidth,
      gridHeight,
      cellSize,
      cellGap,
      boardTheme,
    );
  }

  for (let row = 0; row < gridHeight; row += 1) {
    for (let column = 0; column < gridWidth; column += 1) {
      const index = row * gridWidth + column;
      const x = boardInnerX + column * cellSize;
      const y = boardInnerY + row * cellSize;
      const cell = normalizeEditableCell(cells[index] ?? { label: null, hex: null });
      const fillRgb: Rgb =
        cell.hex
          ? hexToRgb(cell.hex)
          : includeBoardPattern
            ? hexToRgb(getExportBoardPatternColor(boardTheme, column, row))
            : [243, 238, 229];
      context.fillStyle = rgbToCss(fillRgb);
      context.fillRect(x, y, cellSize, cellSize);
      if (cellGap > 0) {
        context.strokeStyle = GRID_SEPARATOR_COLOR;
        context.lineWidth = cellGap;
        context.strokeRect(x, y, cellSize, cellSize);
      }
    }
  }

  if (includeGuides) {
    drawExportGuideLines(
      context,
      boardInnerX,
      boardInnerY,
      boardWidth,
      boardHeight,
      gridWidth,
      gridHeight,
      cellSize,
    );
    drawExportAxisLabels(
      context,
      boardInnerX,
      boardInnerY,
      gridWidth,
      gridHeight,
      cellSize,
      axisGutter,
      axisLabelFontSize,
    );
  }

  if (showColorLabels) {
    context.font = buildFont(labelFontSize, true, false);
    for (let row = 0; row < gridHeight; row += 1) {
      for (let column = 0; column < gridWidth; column += 1) {
        const index = row * gridWidth + column;
        const x = boardInnerX + column * cellSize;
        const y = boardInnerY + row * cellSize;
        const cell = normalizeEditableCell(cells[index] ?? { label: null, hex: null });
        const label = cell.label;
        if (!label || !cell.hex) {
          continue;
        }
        const textFill = chooseTextColor(hexToRgb(cell.hex));
        context.lineWidth = 2;
        context.strokeStyle = textFill === "#FFFFFF" ? "#111111" : "#FFFFFF";
        context.fillStyle = textFill;
        context.strokeText(label, x + cellSize / 2, y + cellSize / 2);
        context.fillText(label, x + cellSize / 2, y + cellSize / 2);
      }
    }
  }

  if (includeLegend) {
    const legendTop = boardBlockY + boardBlockHeight + titleGap;
    const columnsInLastRow = Math.min(colors.length, itemsPerRow);
    const legendLeft =
      (canvasWidth -
        columnsInLastRow * legendTileWidth -
        Math.max(0, columnsInLastRow - 1) * legendGap) /
      2;

    for (let itemIndex = 0; itemIndex < colors.length; itemIndex += 1) {
      const item = colors[itemIndex];
      const row = Math.floor(itemIndex / itemsPerRow);
      const column = itemIndex % itemsPerRow;
      const itemX = legendLeft + column * (legendTileWidth + legendGap);
      const itemY = legendTop + row * (legendTileHeight + legendGap);

      context.beginPath();
      context.roundRect(itemX, itemY, legendTileWidth, legendSwatchHeight, Math.max(6, Math.floor(cellSize / 5)));
      context.fillStyle = item.hex;
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = BOARD_FRAME_COLOR;
      context.stroke();

      context.font = buildFont(legendLabelFontSize, true, false);
      context.lineWidth = 2;
      const swatchRgb = hexToRgb(item.hex);
      const textFill = chooseTextColor(swatchRgb);
      context.strokeStyle = textFill === "#FFFFFF" ? "#111111" : "#FFFFFF";
      context.fillStyle = textFill;
      context.strokeText(item.label, itemX + legendTileWidth / 2, itemY + legendSwatchHeight / 2);
      context.fillText(item.label, itemX + legendTileWidth / 2, itemY + legendSwatchHeight / 2);

      context.font = buildFont(legendCountFontSize, false, false);
      context.fillStyle = "#2C2C2C";
      context.strokeStyle = "transparent";
      context.fillText(
        String(item.count),
        itemX + legendTileWidth / 2,
        itemY + legendSwatchHeight + Math.max(10, Math.floor(cellSize / 5)),
      );
    }
  }

  await drawChartWatermark(
    context,
    canvasWidth,
    canvasHeight,
    canvasPadding,
    boardBlockY,
    chartSettings,
  );

  if (qrBoardPlacement && chartSettings?.shareUrl) {
    const regionSize = qrBoardPlacement.cellSpan * cellSize;
    const regionX = boardInnerX + qrBoardPlacement.cellLeft * cellSize;
    const regionY = boardInnerY + qrBoardPlacement.cellTop * cellSize;
    await drawChartQrCode(
      context,
      {
        x: Math.round(regionX + (regionSize - qrBoardPlacement.cardWidth) / 2),
        y: Math.round(regionY + (regionSize - qrBoardPlacement.cardHeight) / 2),
        cardWidth: qrBoardPlacement.cardWidth,
        cardHeight: qrBoardPlacement.cardHeight,
        cardPadding: qrBoardPlacement.cardPadding,
        qrSize: qrBoardPlacement.qrSize,
        caption: qrCaption,
        captionFontSize: qrCaptionFontSize,
      },
      chartSettings.shareUrl,
      chartQrTooLargeMessage,
    );
  } else if (renderQrBelowBoard && chartSettings?.shareUrl) {
    const qrTop =
      boardBlockY + boardBlockHeight + legendSectionGap + legendSectionHeight + qrSectionGap;
    await drawChartQrCode(
      context,
      {
        x: Math.round((canvasWidth - qrCardWidth) / 2),
        y: Math.round(qrTop),
        cardWidth: qrCardWidth,
        cardHeight: qrCardHeight,
        cardPadding: qrCardPadding,
        qrSize,
        caption: qrCaption,
        captionFontSize: qrCaptionFontSize,
      },
      chartSettings.shareUrl,
      chartQrTooLargeMessage,
    );
  }

  return canvas;
}

async function drawChartWatermark(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  canvasPadding: number,
  contentTop: number,
  chartSettings?: ChartExportSettings,
) {
  const watermarkText = chartSettings?.watermarkText?.trim() ?? "";
  const watermarkImageDataUrl = chartSettings?.watermarkImageDataUrl ?? null;
  if (!watermarkText && !watermarkImageDataUrl) {
    return;
  }

  const regionX = canvasPadding;
  const regionY = contentTop;
  const regionWidth = Math.max(1, canvasWidth - canvasPadding * 2);
  const regionHeight = Math.max(1, canvasHeight - contentTop - canvasPadding);
  const tileWidth = Math.max(180, Math.min(320, Math.floor(regionWidth * 0.24)));
  const tileHeight = Math.max(84, Math.floor(tileWidth * 0.46));
  const imageSize = watermarkImageDataUrl ? Math.min(54, Math.floor(tileHeight * 0.56)) : 0;
  const textFontSize = Math.max(13, Math.floor(tileWidth * 0.11));
  const textGap = imageSize > 0 && watermarkText ? 12 : 0;
  const repeatX = Math.max(160, Math.floor(tileWidth * 1.2));
  const repeatY = Math.max(120, Math.floor(tileHeight * 1.4));
  const image = watermarkImageDataUrl ? await loadChartDecorationImage(watermarkImageDataUrl) : null;
  const textWidth = watermarkText ? estimateTextWidth(textFontSize, true, false, watermarkText) : 0;

  context.save();
  roundRectPath(context, regionX, regionY, regionWidth, regionHeight, Math.max(0, Math.floor(tileHeight * 0.08)));
  context.clip();
  context.translate(regionX + regionWidth / 2, regionY + regionHeight / 2);
  context.rotate((-28 * Math.PI) / 180);
  context.globalAlpha = 0.16;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#5E5346";
  context.font = buildFont(textFontSize, true, false);

  for (let y = -regionHeight; y <= regionHeight; y += repeatY) {
    const rowOffset = Math.round((y / repeatY) % 2) === 0 ? 0 : Math.floor(repeatX / 2);
    for (let x = -regionWidth; x <= regionWidth; x += repeatX) {
      const centerX = x + rowOffset;
      const centerY = y;
      const imageWidth = image && imageSize > 0 ? Math.max(1, Math.round(image.width * Math.min(imageSize / image.width, imageSize / image.height))) : 0;
      const imageHeight = image && imageSize > 0 ? Math.max(1, Math.round(image.height * Math.min(imageSize / image.width, imageSize / image.height))) : 0;
      const groupWidth = imageWidth > 0 && textWidth > 0 ? imageWidth + textGap + textWidth : Math.max(imageWidth, textWidth);
      const groupLeft = centerX - groupWidth / 2;

      if (image && imageWidth > 0 && imageHeight > 0) {
        const drawX = textWidth > 0 ? groupLeft : centerX - imageWidth / 2;
        const drawY = centerY - imageHeight / 2;
        context.drawImage(image, drawX, drawY, imageWidth, imageHeight);
      }

      if (watermarkText) {
        const textX = imageWidth > 0 ? groupLeft + imageWidth + textGap + textWidth / 2 : centerX;
        context.fillText(watermarkText, textX, centerY);
      }
    }
  }

  context.restore();
}

async function drawChartQrCode(
  context: CanvasRenderingContext2D,
  placement: {
    x: number;
    y: number;
    cardWidth: number;
    cardHeight: number;
    cardPadding: number;
    qrSize: number;
    caption: string;
    captionFontSize: number;
  },
  shareUrl: string,
  chartQrTooLargeMessage: string,
) {
  const {
    x: cardX,
    y: cardY,
    cardWidth,
    cardHeight,
    cardPadding,
    qrSize,
    caption,
    captionFontSize,
  } = placement;
  const qrImage = await loadChartQrCodeImage(shareUrl, qrSize, chartQrTooLargeMessage);
  if (!qrImage) {
    throw new Error(chartQrTooLargeMessage);
  }

  const resolvedCaptionFontSize = caption
    ? resolveQrCaptionFontSize(
        context,
        caption,
        captionFontSize,
        Math.max(48, cardWidth - cardPadding * 2),
      )
    : 0;
  const captionGap = caption ? Math.max(12, Math.floor(cardPadding * 0.45)) : 0;
  const captionBlockHeight = caption ? resolvedCaptionFontSize + captionGap : 0;
  const qrX = cardX + Math.round((cardWidth - qrSize) / 2);
  const qrY = cardY + cardPadding + captionBlockHeight;

  context.save();
  context.beginPath();
  context.roundRect(
    cardX,
    cardY,
    cardWidth,
    cardHeight,
    Math.max(12, Math.floor(Math.max(cardWidth, cardHeight) * 0.06)),
  );
  context.fillStyle = "#FFFFFF";
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = "rgba(17,17,17,0.12)";
  context.stroke();

  if (caption) {
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = buildFont(resolvedCaptionFontSize, true, false);
    context.fillStyle = "#2C2C2C";
    context.fillText(
      caption,
      cardX + cardWidth / 2,
      cardY + cardPadding + resolvedCaptionFontSize / 2,
    );
  }

  context.imageSmoothingEnabled = false;
  context.drawImage(
    qrImage,
    qrX,
    qrY,
    qrSize,
    qrSize,
  );
  context.restore();
}

function resolveQrCaptionFontSize(
  context: CanvasRenderingContext2D,
  caption: string,
  preferredFontSize: number,
  maxWidth: number,
) {
  let fontSize = Math.max(11, preferredFontSize);
  while (fontSize > 11) {
    context.font = buildFont(fontSize, true, false);
    if (context.measureText(caption).width <= maxWidth) {
      return fontSize;
    }
    fontSize -= 1;
  }
  return 11;
}

export function findChartQrBoardPlacement(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
  cellSize: number,
  preferredQrSize: number,
  captionBlockHeight = 0,
): ChartQrBoardPlacement | null {
  if (
    gridWidth <= 0 ||
    gridHeight <= 0 ||
    cellSize <= 0 ||
    preferredQrSize <= 0 ||
    cells.length !== gridWidth * gridHeight
  ) {
    return null;
  }

  const normalizedCells = cells.map((cell) => normalizeEditableCell(cell));
  const minQrSize = Math.max(160, Math.floor(cellSize * 5));
  const cardPadding = Math.max(10, Math.floor(cellSize * 0.28));
  const minSpan = Math.ceil((minQrSize + cardPadding * 2 + Math.max(0, captionBlockHeight)) / cellSize);
  const occupiedPrefix = buildOccupiedPrefixSum(normalizedCells, gridWidth, gridHeight);
  const cornerAnchors = [
    { key: "top-left", cellLeft: 0, cellTop: 0, priority: 0 },
    { key: "top-right", cellLeft: 0, cellTop: 0, priority: 1 },
    { key: "bottom-left", cellLeft: 0, cellTop: 0, priority: 2 },
    { key: "bottom-right", cellLeft: 0, cellTop: 0, priority: 3 },
  ] as const;
  let best:
    | (ChartQrBoardPlacement & {
        supportsPreferred: boolean;
        priority: number;
      })
    | null = null;

  for (const anchor of cornerAnchors) {
    const maxSpan = Math.min(gridWidth, gridHeight);
    for (let span = maxSpan; span >= minSpan; span -= 1) {
      const cellLeft =
        anchor.key === "top-right" || anchor.key === "bottom-right"
          ? gridWidth - span
          : 0;
      const cellTop =
        anchor.key === "bottom-left" || anchor.key === "bottom-right"
          ? gridHeight - span
          : 0;
      const regionSize = span * cellSize;
      const maxQrSize = regionSize - cardPadding * 2 - Math.max(0, captionBlockHeight);
      if (maxQrSize < minQrSize) {
        continue;
      }
      if (!isPrefixSquareEmpty(occupiedPrefix, gridWidth, cellLeft, cellTop, span)) {
        continue;
      }

      const supportsPreferred = maxQrSize >= preferredQrSize;
      const qrSize = supportsPreferred ? preferredQrSize : maxQrSize;
      const candidate = {
        cellLeft,
        cellTop,
        cellSpan: span,
        cardWidth: qrSize + cardPadding * 2,
        cardHeight: qrSize + cardPadding * 2 + Math.max(0, captionBlockHeight),
        cardPadding,
        qrSize,
        supportsPreferred,
        priority: anchor.priority,
      };

      if (!best) {
        best = candidate;
        break;
      }
      if (candidate.supportsPreferred !== best.supportsPreferred) {
        if (candidate.supportsPreferred) {
          best = candidate;
        }
        break;
      }
      if (candidate.qrSize > best.qrSize + 0.5) {
        best = candidate;
        break;
      }
      if (
        Math.abs(candidate.qrSize - best.qrSize) <= 0.5 &&
        candidate.priority < best.priority
      ) {
        best = candidate;
      }
      break;
    }
  }

  return best
    ? {
        cellLeft: best.cellLeft,
        cellTop: best.cellTop,
        cellSpan: best.cellSpan,
        cardWidth: best.cardWidth,
        cardHeight: best.cardHeight,
        cardPadding: best.cardPadding,
        qrSize: best.qrSize,
      }
    : null;
}

function buildOccupiedPrefixSum(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
) {
  const prefix = new Uint32Array((gridWidth + 1) * (gridHeight + 1));

  for (let row = 0; row < gridHeight; row += 1) {
    let rowOccupied = 0;
    for (let column = 0; column < gridWidth; column += 1) {
      const index = row * gridWidth + column;
      const cell = cells[index];
      if (cell?.label || cell?.hex) {
        rowOccupied += 1;
      }
      const prefixIndex = (row + 1) * (gridWidth + 1) + (column + 1);
      prefix[prefixIndex] = prefix[row * (gridWidth + 1) + (column + 1)] + rowOccupied;
    }
  }

  return prefix;
}

function isPrefixSquareEmpty(
  prefix: Uint32Array,
  gridWidth: number,
  cellLeft: number,
  cellTop: number,
  span: number,
) {
  const stride = gridWidth + 1;
  const left = cellLeft;
  const top = cellTop;
  const right = cellLeft + span;
  const bottom = cellTop + span;
  const occupied =
    prefix[bottom * stride + right] -
    prefix[top * stride + right] -
    prefix[bottom * stride + left] +
    prefix[top * stride + left];
  return occupied === 0;
}

function loadChartDecorationImage(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function loadChartQrCodeImage(
  shareUrl: string,
  size: number,
  chartQrTooLargeMessage: string,
) {
  try {
    const src = await createEmbeddedChartQrDataUrl(shareUrl, size);
    return loadChartDecorationImage(src);
  } catch {
    throw new Error(chartQrTooLargeMessage);
  }
}

function drawBrandLogo(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  const stroke = "rgba(33,24,17,0.88)";
  const paperFill = "#F5E8D2";
  const gridStroke = "#CDB79A";
  const beadHole = "#F7F2E8";
  const lineWidth = Math.max(1.4, size * 0.08);

  const paperX = x + size * 0.06;
  const paperY = y + size * 0.06;
  const paperWidth = size * 0.66;
  const paperHeight = size * 0.82;
  const foldSize = size * 0.18;
  const radius = Math.max(4, size * 0.08);

  context.beginPath();
  roundRectPath(context, paperX, paperY, paperWidth, paperHeight, radius);
  context.fillStyle = paperFill;
  context.fill();
  context.lineWidth = lineWidth;
  context.strokeStyle = stroke;
  context.stroke();

  context.beginPath();
  context.moveTo(paperX + paperWidth - foldSize, paperY);
  context.lineTo(paperX + paperWidth - foldSize, paperY + foldSize);
  context.lineTo(paperX + paperWidth, paperY + foldSize);
  context.strokeStyle = stroke;
  context.stroke();

  context.strokeStyle = gridStroke;
  context.lineWidth = Math.max(1, size * 0.045);
  const gridLeft = paperX + size * 0.12;
  const gridTop = paperY + size * 0.18;
  const gridWidth = paperWidth - size * 0.2;
  const gridHeight = paperHeight - size * 0.28;
  for (let index = 1; index <= 2; index += 1) {
    const verticalX = gridLeft + (gridWidth / 3) * index;
    const horizontalY = gridTop + (gridHeight / 3) * index;
    context.beginPath();
    context.moveTo(verticalX, gridTop);
    context.lineTo(verticalX, gridTop + gridHeight);
    context.stroke();
    context.beginPath();
    context.moveTo(gridLeft, horizontalY);
    context.lineTo(gridLeft + gridWidth, horizontalY);
    context.stroke();
  }

  const beadRadius = size * 0.18;
  const innerRadius = beadRadius * 0.42;
  const beads: Array<[number, number, string]> = [
    [x + size * 0.28, y + size * 0.72, "#D57D42"],
    [x + size * 0.53, y + size * 0.56, "#8DAE63"],
    [x + size * 0.77, y + size * 0.76, "#6E87C7"],
  ];

  for (const [centerX, centerY, fill] of beads) {
    context.beginPath();
    context.arc(centerX, centerY, beadRadius, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
    context.lineWidth = lineWidth;
    context.strokeStyle = stroke;
    context.stroke();

    context.beginPath();
    context.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
    context.fillStyle = beadHole;
    context.fill();
    context.strokeStyle = stroke;
    context.stroke();
  }
}

function estimateTextWidth(
  size: number,
  bold: boolean,
  serif: boolean,
  text: string,
) {
  return text.length * size * (serif ? 1.02 : 0.62);
}

function roundRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const effectiveRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + effectiveRadius, y);
  context.arcTo(x + width, y, x + width, y + height, effectiveRadius);
  context.arcTo(x + width, y + height, x, y + height, effectiveRadius);
  context.arcTo(x, y + height, x, y, effectiveRadius);
  context.arcTo(x, y, x + width, y, effectiveRadius);
  context.closePath();
}

function chooseTextColor(rgb: Rgb) {
  const luminance = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255;
  return luminance < 0.48 ? "#FFFFFF" : "#111111";
}

function summarizeCells(cells: EditableCell[], paletteDefinition: PaletteDefinition) {
  const counts = new Map<string, number>();
  for (const cell of cells) {
    const normalized = normalizeEditableCell(cell);
    if (!normalized.label) {
      continue;
    }
    counts.set(normalized.label, (counts.get(normalized.label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0], "en");
    })
    .map(([label, count]) => {
      const paletteColor = paletteDefinition.byLabel.get(label);
      return {
        label,
        count,
        hex: paletteColor?.hex ?? "#000000",
      };
    });
}

export function collapseOpenBackgroundAreas(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
) {
  const normalizedCells = cells.map((cell) => normalizeEditableCell(cell));
  if (gridWidth <= 0 || gridHeight <= 0 || normalizedCells.length !== gridWidth * gridHeight) {
    return normalizedCells;
  }

  const visited = new Uint8Array(normalizedCells.length);
  const nextCells = normalizedCells.map((cell) => ({ ...cell }));
  const minimumOpenArea = Math.max(6, Math.round(normalizedCells.length * 0.015));
  const protectedGapMask = buildProtectedBackgroundGapMask(
    normalizedCells,
    gridWidth,
    gridHeight,
  );

  for (let index = 0; index < normalizedCells.length; index += 1) {
    if (visited[index] || protectedGapMask[index]) {
      continue;
    }

    const cell = normalizedCells[index];
    if (!isBackgroundCandidateCell(cell)) {
      continue;
    }

    const queue = [index];
    const component: number[] = [];
    const touchedEdges = new Set<"left" | "right" | "top" | "bottom">();
    visited[index] = 1;

    while (queue.length > 0) {
      const currentIndex = queue.pop()!;
      component.push(currentIndex);
      const x = currentIndex % gridWidth;
      const y = Math.floor(currentIndex / gridWidth);

      if (x === 0) {
        touchedEdges.add("left");
      }
      if (x === gridWidth - 1) {
        touchedEdges.add("right");
      }
      if (y === 0) {
        touchedEdges.add("top");
      }
      if (y === gridHeight - 1) {
        touchedEdges.add("bottom");
      }

      const neighbors = [
        currentIndex - 1,
        currentIndex + 1,
        currentIndex - gridWidth,
        currentIndex + gridWidth,
      ];

      for (const neighborIndex of neighbors) {
        if (
          neighborIndex < 0 ||
          neighborIndex >= normalizedCells.length ||
          visited[neighborIndex] ||
          protectedGapMask[neighborIndex]
        ) {
          continue;
        }

        const neighborX = neighborIndex % gridWidth;
        const neighborY = Math.floor(neighborIndex / gridWidth);
        if (Math.abs(neighborX - x) + Math.abs(neighborY - y) !== 1) {
          continue;
        }

        const neighbor = normalizedCells[neighborIndex];
        if (!belongsToSameBackgroundComponent(cell, neighbor)) {
          continue;
        }

        visited[neighborIndex] = 1;
        queue.push(neighborIndex);
      }
    }

    if (
      touchedEdges.size === 0 ||
      (component.length < minimumOpenArea && touchedEdges.size < 2)
    ) {
      continue;
    }

    for (const componentIndex of component) {
      nextCells[componentIndex] = { label: null, hex: null };
    }
  }

  return nextCells;
}

function isBackgroundCandidateCell(cell: EditableCell) {
  if (!cell.label || !cell.hex) {
    return false;
  }

  return (
    cell.label.trim().toUpperCase() === "H2" ||
    cell.hex.toUpperCase() === OMITTED_BACKGROUND_HEX
  );
}

function belongsToSameBackgroundComponent(
  base: EditableCell,
  candidate: EditableCell,
) {
  if (!isBackgroundCandidateCell(base) || !isBackgroundCandidateCell(candidate)) {
    return false;
  }

  if (base.label && candidate.label && base.label === candidate.label) {
    return true;
  }

  if (base.hex && candidate.hex && base.hex.toUpperCase() === candidate.hex.toUpperCase()) {
    return true;
  }

  return false;
}

function buildProtectedBackgroundGapMask(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
) {
  const mask = new Uint8Array(cells.length);

  for (let index = 0; index < cells.length; index += 1) {
    const mouth = getProtectedBackgroundMouth(cells, gridWidth, gridHeight, index);
    if (!mouth) {
      continue;
    }

    const firstRegion = collectBackgroundSubregion(
      cells,
      gridWidth,
      gridHeight,
      mouth.firstNeighborIndex,
      index,
      cells[index],
    );
    const secondRegion = collectBackgroundSubregion(
      cells,
      gridWidth,
      gridHeight,
      mouth.secondNeighborIndex,
      index,
      cells[index],
    );
    if (firstRegion.touchesEdge === secondRegion.touchesEdge) {
      continue;
    }

    const protectedRegion = firstRegion.touchesEdge ? secondRegion : firstRegion;
    mask[index] = 1;
    for (const protectedIndex of protectedRegion.indices) {
      mask[protectedIndex] = 1;
    }
  }

  return mask;
}

function getProtectedBackgroundMouth(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
  index: number,
) {
  const cell = cells[index];
  if (!isBackgroundCandidateCell(cell)) {
    return false;
  }

  const x = index % gridWidth;
  const y = Math.floor(index / gridWidth);
  if (x <= 0 || y <= 0 || x >= gridWidth - 1 || y >= gridHeight - 1) {
    return null;
  }

  const leftIndex = index - 1;
  const rightIndex = index + 1;
  const upIndex = index - gridWidth;
  const downIndex = index + gridWidth;

  const leftWall = isForegroundBarrierCell(cells, gridWidth, gridHeight, x - 1, y);
  const rightWall = isForegroundBarrierCell(cells, gridWidth, gridHeight, x + 1, y);
  const upWall = isForegroundBarrierCell(cells, gridWidth, gridHeight, x, y - 1);
  const downWall = isForegroundBarrierCell(cells, gridWidth, gridHeight, x, y + 1);
  const upBackground = belongsToSameBackgroundComponent(cell, cells[upIndex]);
  const downBackground = belongsToSameBackgroundComponent(cell, cells[downIndex]);
  const leftBackground = belongsToSameBackgroundComponent(cell, cells[leftIndex]);
  const rightBackground = belongsToSameBackgroundComponent(cell, cells[rightIndex]);

  if (leftWall && rightWall && upBackground && downBackground) {
    return {
      firstNeighborIndex: upIndex,
      secondNeighborIndex: downIndex,
    };
  }

  if (upWall && downWall && leftBackground && rightBackground) {
    return {
      firstNeighborIndex: leftIndex,
      secondNeighborIndex: rightIndex,
    };
  }

  return null;
}

function isForegroundBarrierCell(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
  x: number,
  y: number,
) {
  if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) {
    return false;
  }

  return !isBackgroundCandidateCell(cells[y * gridWidth + x]);
}

function collectBackgroundSubregion(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
  startIndex: number,
  blockedIndex: number,
  baseCell: EditableCell,
) {
  const indices: number[] = [];
  const queue = [startIndex];
  const visited = new Set<number>([blockedIndex, startIndex]);
  let touchesEdge = false;

  while (queue.length > 0) {
    const currentIndex = queue.pop()!;
    indices.push(currentIndex);
    const x = currentIndex % gridWidth;
    const y = Math.floor(currentIndex / gridWidth);
    if (x === 0 || y === 0 || x === gridWidth - 1 || y === gridHeight - 1) {
      touchesEdge = true;
    }

    const neighbors = [
      currentIndex - 1,
      currentIndex + 1,
      currentIndex - gridWidth,
      currentIndex + gridWidth,
    ];
    for (const neighborIndex of neighbors) {
      if (
        neighborIndex < 0 ||
        neighborIndex >= cells.length ||
        visited.has(neighborIndex)
      ) {
        continue;
      }

      const neighborX = neighborIndex % gridWidth;
      const neighborY = Math.floor(neighborIndex / gridWidth);
      if (Math.abs(neighborX - x) + Math.abs(neighborY - y) !== 1) {
        continue;
      }

      if (!belongsToSameBackgroundComponent(baseCell, cells[neighborIndex])) {
        continue;
      }

      visited.add(neighborIndex);
      queue.push(neighborIndex);
    }
  }

  return {
    indices,
    touchesEdge,
  };
}

function normalizeEditableCell(cell: EditableCell): EditableCell {
  if (!cell.label || !cell.hex) {
    return { label: null, hex: null, source: null };
  }

  return {
    label: cell.label,
    hex: cell.hex.toUpperCase(),
    source: cell.source ?? "detected",
  };
}

function buildFont(size: number, bold: boolean, serif: boolean) {
  const family = serif
    ? '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif'
    : '"Aptos Mono", "Cascadia Mono", Consolas, "SFMono-Regular", monospace';
  return `${bold ? "700" : "400"} ${size}px ${family}`;
}

function scaleLogicalNearest(logical: RasterImage, width: number, height: number): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(logical.height - 1, Math.floor((y / height) * logical.height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(logical.width - 1, Math.floor((x / width) * logical.width));
      const sourceIndex = (sourceY * logical.width + sourceX) * 4;
      const targetIndex = (y * width + x) * 4;
      data[targetIndex] = logical.data[sourceIndex];
      data[targetIndex + 1] = logical.data[sourceIndex + 1];
      data[targetIndex + 2] = logical.data[sourceIndex + 2];
      data[targetIndex + 3] = logical.data[sourceIndex + 3];
    }
  }
  return { width, height, data };
}

function buildEdges(total: number, segments: number) {
  const edges = new Int32Array(segments + 1);
  for (let index = 0; index <= segments; index += 1) {
    edges[index] = Math.round((index / segments) * total);
  }
  return edges;
}

function countUniqueColors(data: Uint8ClampedArray) {
  const set = new Set<number>();
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < MIN_VISIBLE_PIXEL_ALPHA) {
      continue;
    }
    const code = (data[index] << 16) | (data[index + 1] << 8) | data[index + 2];
    set.add(code);
  }
  return set.size;
}

function codeToRgb(code: number): Rgb {
  return [
    (code >> 16) & 0xff,
    (code >> 8) & 0xff,
    code & 0xff,
  ];
}

function rgbToGray(rgb: Rgb) {
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
}

function rgbToOklab(rgb: Rgb): Oklab {
  const red = srgbToLinear(rgb[0] / 255);
  const green = srgbToLinear(rgb[1] / 255);
  const blue = srgbToLinear(rgb[2] / 255);

  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return [
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  ];
}

function oklabDistanceSquared(left: Oklab, right: Oklab) {
  const lDelta = left[0] - right[0];
  const aDelta = left[1] - right[1];
  const bDelta = left[2] - right[2];
  return lDelta * lDelta + aDelta * aDelta + bDelta * bDelta;
}

function srgbToLinear(channel: number) {
  if (channel <= 0.04045) {
    return channel / 12.92;
  }
  return Math.pow((channel + 0.055) / 1.055, 2.4);
}

function hexToRgb(value: string): Rgb {
  const stripped = value.trim().replace(/^#/, "");
  if (stripped.length !== 6) {
    throw new Error(`Unsupported hex color: ${value}`);
  }
  return [
    Number.parseInt(stripped.slice(0, 2), 16),
    Number.parseInt(stripped.slice(2, 4), 16),
    Number.parseInt(stripped.slice(4, 6), 16),
  ];
}

function rgbToCss(rgb: Rgb) {
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
}

function getPixel(image: RasterImage, x: number, y: number): Rgb {
  const index = (y * image.width + x) * 4;
  return [image.data[index], image.data[index + 1], image.data[index + 2]];
}

export function convertRasterToGrayscale(image: RasterImage): RasterImage {
  const data = new Uint8ClampedArray(image.data);
  for (let index = 0; index < data.length; index += 4) {
    const grayscale = Math.round(
      data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114,
    );
    data[index] = grayscale;
    data[index + 1] = grayscale;
    data[index + 2] = grayscale;
  }

  return {
    width: image.width,
    height: image.height,
    data,
  };
}

function smoothstep01(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export function applySoftGrayscaleToneCurve(image: RasterImage): RasterImage {
  const data = new Uint8ClampedArray(image.data);
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < MIN_VISIBLE_PIXEL_ALPHA) {
      continue;
    }

    const normalized = data[index] / 255;
    const curved =
      normalized * (1 - GRAYSCALE_CURVE_BLEND) +
      smoothstep01(normalized) * GRAYSCALE_CURVE_BLEND;
    const mapped = clampToByte(curved * 255);
    data[index] = mapped;
    data[index + 1] = mapped;
    data[index + 2] = mapped;
  }

  return {
    width: image.width,
    height: image.height,
    data,
  };
}

export function applyContrast(image: RasterImage, amount: number): RasterImage {
  const clampedAmount = Math.max(-100, Math.min(100, amount));
  if (clampedAmount === 0) {
    return image;
  }

  const factor = (100 + clampedAmount) / 100;
  const data = new Uint8ClampedArray(image.data);
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      data[index + channel] = Math.max(
        0,
        Math.min(255, Math.round((data[index + channel] - 128) * factor + 128)),
      );
    }
  }

  return {
    width: image.width,
    height: image.height,
    data,
  };
}

function cloneRaster(image: RasterImage): RasterImage {
  return {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data),
  };
}

function arrayMean(signal: Float32Array) {
  let sum = 0;
  for (const value of signal) {
    sum += value;
  }
  return sum / signal.length;
}

function medianOfNumbers(values: number[]) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function arrayStandardDeviation(signal: Float32Array, mean: number) {
  let sum = 0;
  for (const value of signal) {
    const delta = value - mean;
    sum += delta * delta;
  }
  return Math.sqrt(sum / signal.length);
}

function smoothSignal(signal: Float32Array) {
  if (signal.length <= 2) {
    return signal;
  }

  const smoothed = new Float32Array(signal.length);
  smoothed[0] = signal[0];
  smoothed[signal.length - 1] = signal[signal.length - 1];
  for (let index = 1; index < signal.length - 1; index += 1) {
    smoothed[index] =
      signal[index - 1] * 0.25 +
      signal[index] * 0.5 +
      signal[index + 1] * 0.25;
  }
  return smoothed;
}

function clampToByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampNormalized(value: number) {
  return Math.max(0, Math.min(1, value));
}

function canvasToBlob(canvas: HTMLCanvasElement, encodingFailedMessage: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(encodingFailedMessage));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}


