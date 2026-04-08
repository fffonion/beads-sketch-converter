import paletteJson from "../data/mard-palette-221.json";
import colorSystemMappingJson from "../data/color-system-mapping.json";

const DEFAULT_MIN_GRID_CELLS = 4;
const DEFAULT_MAX_GRID_CELLS = 512;
const GRID_SEPARATOR_COLOR = "#C9C4BC";
const BOARD_FRAME_COLOR = "#111111";
const CANVAS_BACKGROUND = "#F7F4EE";
const OMITTED_BACKGROUND_HEX = "#FFFFFF";
const MAX_DETECTION_EDGE = 768;
const BRAND_NAME = "拼豆豆";

type Segment = [number, number];
type CropBox = [number, number, number, number];
type Rgb = [number, number, number];
type Oklab = [number, number, number];

interface AxisGrid {
  period: number;
  firstLine: number;
  lastLine: number;
  sequenceCount: number;
}

interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

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

export interface DetectionResult {
  gridWidth: number;
  gridHeight: number;
  cropBox: CropBox;
  mode: string;
  xSegments?: Segment[];
  ySegments?: Segment[];
}

export interface ProcessOptions {
  colorSystemId?: string;
  gridMode: "auto" | "manual";
  gridWidth?: number;
  gridHeight?: number;
  cropRect?: NormalizedCropRect | null;
  reduceColors: boolean;
  reduceTolerance: number;
  preSharpen: boolean;
  preSharpenStrength: number;
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
  chartTitle: (width: number, height: number) => string;
  chartMetaLine: (colorSystemLabel: string, totalBeads: number) => string;
}

export interface ColorCount {
  label: string;
  count: number;
  hex: string;
}

export interface EditableCell {
  label: string | null;
  hex: string | null;
}

export interface PaletteOption {
  label: string;
  hex: string;
}

export interface ProcessResult {
  blob: Blob;
  fileName: string;
  detectionMode: string;
  preferredEditorMode: "edit" | "pindou";
  detectedCropRect: NormalizedCropRect | null;
  gridWidth: number;
  gridHeight: number;
  originalUniqueColors: number;
  reducedUniqueColors: number;
  paletteColorsUsed: number;
  colors: ColorCount[];
  cells: EditableCell[];
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

const paletteMap = paletteJson as Record<string, string>;
const colorSystemMapping = colorSystemMappingJson as Record<string, Record<string, string>>;

interface PaletteDefinition {
  id: string;
  label: string;
  colors: PaletteColor[];
  byLabel: Map<string, PaletteColor>;
  options: PaletteOption[];
}

interface ChartImportDetection {
  logical: RasterImage;
  gridWidth: number;
  gridHeight: number;
  mode: string;
  cropBox: CropBox;
}

interface FrameBoxDetection {
  outer: CropBox;
  inner: CropBox;
}

interface DetectionPreparation {
  raster: RasterImage;
  scaleX: number;
  scaleY: number;
}

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

const paletteDefinitions = new Map<string, PaletteDefinition>();
paletteDefinitions.set("mard_221", buildPaletteDefinition("mard_221", "MARD 221", paletteMap));

for (const systemName of ["MARD", "COCO", "漫漫", "盼盼", "咪小窝"]) {
  const labelToHex: Record<string, string> = {};
  for (const [hex, mapping] of Object.entries(colorSystemMapping)) {
    const label = mapping[systemName];
    if (label) {
      labelToHex[label] = hex.toUpperCase();
    }
  }

  const id = systemName === "MARD" ? "mard_full" : `system_${systemName}`;
  const label = systemName === "MARD" ? "MARD Full" : systemName;
  paletteDefinitions.set(id, buildPaletteDefinition(id, label, labelToHex));
}

export const colorSystemOptions: ColorSystemOption[] = [
  { id: "mard_221", label: "MARD 221" },
  { id: "mard_full", label: "MARD Full" },
  { id: "system_COCO", label: "COCO" },
  { id: "system_漫漫", label: "漫漫" },
  { id: "system_盼盼", label: "盼盼" },
  { id: "system_咪小窝", label: "咪小窝" },
].filter((option) => paletteDefinitions.has(option.id));

export function getPaletteOptions(colorSystemId = "mard_221"): PaletteOption[] {
  return getPaletteDefinition(colorSystemId).options;
}

function getPaletteDefinition(colorSystemId = "mard_221"): PaletteDefinition {
  return paletteDefinitions.get(colorSystemId) ?? paletteDefinitions.get("mard_221")!;
}

const defaultProcessMessages: ProcessMessages = {
  nonPixelArtError:
    "This image does not look like grid-based pixel art. Switch to Manual Grid and provide width and height first.",
  manualGridRequired: "Manual mode requires both grid width and grid height.",
  canvasContextUnavailable: "Canvas 2D context is not available in this browser.",
  encodingFailed: "Failed to encode output image.",
  chartTitle: (width, height) => `Bead Chart - ${width} x ${height}`,
  chartMetaLine: (colorSystemLabel, totalBeads) => `${colorSystemLabel} · ${totalBeads} beads`,
};

export async function processImageFile(
  file: File,
  options: ProcessOptions,
): Promise<ProcessResult> {
  const processMessages = {
    ...defaultProcessMessages,
    ...options.messages,
  };
  const paletteDefinition = getPaletteDefinition(options.colorSystemId);
  const loadedSource = await loadFileAsRaster(file, processMessages.canvasContextUnavailable);
  const source = options.cropRect
    ? cropNormalizedRaster(loadedSource, options.cropRect)
    : loadedSource;
  let logical: RasterImage;
  let gridWidth: number;
  let gridHeight: number;
  let detectionMode: string;
  let preferredEditorMode: "edit" | "pindou" = "edit";
  let detectedCropRect: NormalizedCropRect | null = null;

  if (options.gridMode === "auto") {
    const chartImport = detectChartLikePixelArtPrepared(source, file.name);
    if (chartImport) {
      logical = sampleRegularGrid(
        cropRaster(source, chartImport.cropBox),
        chartImport.gridWidth,
        chartImport.gridHeight,
      );
      gridWidth = chartImport.gridWidth;
      gridHeight = chartImport.gridHeight;
      detectionMode = chartImport.mode;
      preferredEditorMode = "pindou";
      detectedCropRect = cropBoxToNormalizedCropRect(source.width, source.height, chartImport.cropBox);
    } else {
      const detection = detectPixelArtPrepared(source);
      if (!detection) {
        throw new Error(processMessages.nonPixelArtError);
      }

      if (detection.xSegments && detection.ySegments) {
        logical = sampleSegments(source, detection.xSegments, detection.ySegments);
      } else {
        logical = sampleRegularGrid(
          cropRaster(source, detection.cropBox),
          detection.gridWidth,
          detection.gridHeight,
        );
      }

      gridWidth = detection.gridWidth;
      gridHeight = detection.gridHeight;
      detectionMode = detection.mode;
      detectedCropRect = cropBoxToNormalizedCropRect(source.width, source.height, detection.cropBox);
    }

    if (preferredEditorMode !== "pindou" && shouldDefaultToPindouModePrepared(source, file.name)) {
      preferredEditorMode = "pindou";
    }
  } else {
    if (!options.gridWidth || !options.gridHeight) {
      throw new Error(processMessages.manualGridRequired);
    }

    gridWidth = options.gridWidth;
    gridHeight = options.gridHeight;
    logical = convertImageToLogicalGrid(
      source,
      gridWidth,
      gridHeight,
      options.preSharpen,
      options.preSharpenStrength,
    );
    detectionMode = "converted-from-image";
  }

  const originalUniqueColors = countUniqueColors(logical.data);
  let reducedUniqueColors = originalUniqueColors;
  if (options.reduceColors) {
    const reduced = reduceColorsPhotoshopStyle(logical, options.reduceTolerance);
    logical = reduced.image;
    reducedUniqueColors = reduced.reducedUniqueColors;
  }

  const matched = matchPalette(logical, paletteDefinition);
  const normalizedCells = collapseOpenBackgroundAreas(
    matched.cells,
    gridWidth,
    gridHeight,
  );
  const colors = summarizeCells(normalizedCells, paletteDefinition);
  const totalBeads = colors.reduce((sum, color) => sum + color.count, 0);
  const canvas = renderChart(
    normalizedCells,
    colors,
    gridWidth,
    gridHeight,
    chooseCellSize(gridWidth, gridHeight, options.cellSize),
    processMessages.chartTitle(gridWidth, gridHeight),
    processMessages.chartMetaLine(paletteDefinition.label, totalBeads),
    processMessages.canvasContextUnavailable,
  );
  const blob = await canvasToBlob(canvas, processMessages.encodingFailed);

  return {
    blob,
    fileName: defaultOutputName(file.name, gridWidth, gridHeight),
    detectionMode,
    preferredEditorMode,
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

export function debugAutoDetectRaster(
  image: AutoDetectionDebugInput,
  fileName: string,
  options?: { detailed?: boolean },
): AutoDetectionDebugResult {
  const raster: RasterImage = {
    width: image.width,
    height: image.height,
    data: image.data,
  };
  const prepared = prepareDetectionRaster(raster);
  const debugRaster = prepared.raster;
  const mapDebugCrop = (cropBox: CropBox | null) =>
    cropBox ? mapPreparedCropBoxToSource(cropBox, raster, prepared) : null;
  const mapDebugY = (value: number | null) =>
    value === null ? null : Math.round(value * prepared.scaleY);
  const detailed = options?.detailed ?? false;

  const chartImport = detectChartLikePixelArtPrepared(raster, fileName);
  const detection = chartImport ? null : detectPixelArtPrepared(raster);
  const preferredEditorMode = chartImport || shouldDefaultToPindouModePrepared(raster, fileName)
    ? "pindou"
    : "edit";

  if (!detailed) {
    if (chartImport) {
      const cropWidth = chartImport.cropBox[2] - chartImport.cropBox[0];
      const cropHeight = chartImport.cropBox[3] - chartImport.cropBox[1];
      return {
        mode: chartImport.mode,
        gridWidth: chartImport.gridWidth,
        gridHeight: chartImport.gridHeight,
        cropBox: chartImport.cropBox,
        cropRatio: cropWidth / Math.max(1, cropHeight),
        preferredEditorMode: "pindou",
      };
    }

    if (!detection) {
      return {
        mode: "none",
        gridWidth: 0,
        gridHeight: 0,
        cropBox: null,
        cropRatio: null,
        preferredEditorMode,
      };
    }

    const cropWidth = detection.cropBox[2] - detection.cropBox[0];
    const cropHeight = detection.cropBox[3] - detection.cropBox[1];
    return {
      mode: detection.mode,
      gridWidth: detection.gridWidth,
      gridHeight: detection.gridHeight,
      cropBox: detection.cropBox,
      cropRatio: cropWidth / Math.max(1, cropHeight),
      preferredEditorMode,
    };
  }

  const frameBox = detectDarkFrameBox(debugRaster);
  const wholeLegendTop = detectLegendTop(debugRaster);
  const wholeDirectCandidate = detectBestLegendBoardCandidate(debugRaster);
  const wholeSeparatorBoardBox = detectLightSeparatorBoardBox(debugRaster);
  const trimmedContentBox = detectLooseContentBox(debugRaster);
  const trimmedLegendTop = trimmedContentBox
    ? detectLegendTop(cropRaster(debugRaster, trimmedContentBox))
    : null;
  const trimmedLegendCandidate =
    trimmedContentBox && trimmedLegendTop !== null
      ? detectBestLegendBoardCandidate(
          cropRaster(cropRaster(debugRaster, trimmedContentBox), [
            0,
            0,
            trimmedContentBox[2] - trimmedContentBox[0],
            trimmedLegendTop,
          ]),
        )
      : null;
  const trimmedSeparatorBoardBox =
    trimmedContentBox && trimmedLegendTop !== null
      ? detectLightSeparatorBoardBox(
          cropRaster(cropRaster(debugRaster, trimmedContentBox), [
            0,
            0,
            trimmedContentBox[2] - trimmedContentBox[0],
            trimmedLegendTop,
          ]),
        )
      : null;
  const trimmedBoardDetection =
    trimmedContentBox && trimmedLegendTop !== null
      ? (() => {
          const boardRegion = cropRaster(cropRaster(debugRaster, trimmedContentBox), [
            0,
            0,
            trimmedContentBox[2] - trimmedContentBox[0],
            trimmedLegendTop,
          ]);
          return (
            detectLightSeparatorPixelArt(boardRegion) ??
            detectGridlinePixelArt(boardRegion) ??
            detectGappedGridPixelArt(boardRegion) ??
            detectBlockPixelArt(boardRegion)
          );
        })()
      : null;
  const trimmedDenseBandBox =
    trimmedContentBox && trimmedLegendTop !== null
      ? detectDenseLooseContentBandBox(
          cropRaster(cropRaster(debugRaster, trimmedContentBox), [
            0,
            0,
            trimmedContentBox[2] - trimmedContentBox[0],
            trimmedLegendTop,
          ]),
        )
      : null;
  const trimmedConnectedBox =
    trimmedContentBox && trimmedLegendTop !== null
      ? detectLargestLooseContentComponentBox(
          cropRaster(cropRaster(debugRaster, trimmedContentBox), [
            0,
            0,
            trimmedContentBox[2] - trimmedContentBox[0],
            trimmedLegendTop,
          ]),
        )
      : null;
  const trimmedHoughDetection =
    trimmedContentBox && trimmedLegendTop !== null
      ? detectOrthogonalHoughChartBoard(
          cropRaster(cropRaster(debugRaster, trimmedContentBox), [
            0,
            0,
            trimmedContentBox[2] - trimmedContentBox[0],
            trimmedLegendTop,
          ]),
        )
      : null;
  const trimmedSeparatorFamilyDetection =
    trimmedContentBox && trimmedLegendTop !== null && trimmedSeparatorBoardBox
      ? detectLegendBoardFromCandidateBox(
          cropRaster(cropRaster(debugRaster, trimmedContentBox), [
            0,
            0,
            trimmedContentBox[2] - trimmedContentBox[0],
            trimmedLegendTop,
          ]),
          trimmedSeparatorBoardBox,
        )
      : null;
  const trimmedConnectedFamilyDetection =
    trimmedContentBox && trimmedLegendTop !== null && trimmedConnectedBox
      ? detectLegendBoardFromCandidateBox(
          cropRaster(cropRaster(debugRaster, trimmedContentBox), [
            0,
            0,
            trimmedContentBox[2] - trimmedContentBox[0],
            trimmedLegendTop,
          ]),
          trimmedConnectedBox,
        )
      : null;
  const legendRegion = frameBox
    ? cropRaster(debugRaster, [0, frameBox.outer[3], debugRaster.width, debugRaster.height])
    : null;
  const chartLegendDetected = legendRegion ? looksLikeChartLegend(legendRegion) : false;
  const chartLayoutAccepted = frameBox && legendRegion
    ? isPlausibleChartImportLayout(debugRaster, frameBox, legendRegion, fileName)
    : false;
  if (chartImport) {
    const cropWidth = chartImport.cropBox[2] - chartImport.cropBox[0];
    const cropHeight = chartImport.cropBox[3] - chartImport.cropBox[1];
    return {
      mode: chartImport.mode,
      gridWidth: chartImport.gridWidth,
      gridHeight: chartImport.gridHeight,
      cropBox: chartImport.cropBox,
      cropRatio: cropWidth / Math.max(1, cropHeight),
      preferredEditorMode: "pindou",
      chartFrameDetected: Boolean(frameBox),
      chartLegendDetected,
      chartLayoutAccepted,
      wholeLegendTop: mapDebugY(wholeLegendTop),
      wholeDirectCandidateMode: wholeDirectCandidate?.mode ?? null,
      wholeDirectCandidateGrid: wholeDirectCandidate
        ? [wholeDirectCandidate.gridWidth, wholeDirectCandidate.gridHeight]
        : null,
      wholeDirectCandidateCrop: mapDebugCrop(wholeDirectCandidate?.cropBox ?? null),
      wholeSeparatorBoardBox: mapDebugCrop(wholeSeparatorBoardBox),
      trimmedContentBox: mapDebugCrop(trimmedContentBox),
      trimmedLegendTop: mapDebugY(trimmedLegendTop),
      trimmedLegendCandidateMode: trimmedLegendCandidate?.mode ?? null,
      trimmedLegendCandidateGrid: trimmedLegendCandidate
        ? [trimmedLegendCandidate.gridWidth, trimmedLegendCandidate.gridHeight]
        : null,
      trimmedLegendCandidateCrop: mapDebugCrop(trimmedLegendCandidate?.cropBox ?? null),
      trimmedSeparatorBoardBox: mapDebugCrop(trimmedSeparatorBoardBox),
      trimmedBoardDetectionMode: trimmedBoardDetection?.mode ?? null,
      trimmedBoardDetectionGrid: trimmedBoardDetection
        ? [trimmedBoardDetection.gridWidth, trimmedBoardDetection.gridHeight]
        : null,
      trimmedBoardDetectionCrop: mapDebugCrop(trimmedBoardDetection?.cropBox ?? null),
      trimmedDenseBandBox: mapDebugCrop(trimmedDenseBandBox),
      trimmedConnectedBox: mapDebugCrop(trimmedConnectedBox),
      trimmedHoughGrid: trimmedHoughDetection
        ? [trimmedHoughDetection.gridWidth, trimmedHoughDetection.gridHeight]
        : null,
      trimmedHoughCrop: mapDebugCrop(trimmedHoughDetection?.cropBox ?? null),
      trimmedSeparatorFamilyMode: trimmedSeparatorFamilyDetection?.mode ?? null,
      trimmedSeparatorFamilyGrid: trimmedSeparatorFamilyDetection
        ? [trimmedSeparatorFamilyDetection.gridWidth, trimmedSeparatorFamilyDetection.gridHeight]
        : null,
      trimmedSeparatorFamilyCrop: mapDebugCrop(trimmedSeparatorFamilyDetection?.cropBox ?? null),
      trimmedConnectedFamilyMode: trimmedConnectedFamilyDetection?.mode ?? null,
      trimmedConnectedFamilyGrid: trimmedConnectedFamilyDetection
        ? [trimmedConnectedFamilyDetection.gridWidth, trimmedConnectedFamilyDetection.gridHeight]
        : null,
      trimmedConnectedFamilyCrop: mapDebugCrop(trimmedConnectedFamilyDetection?.cropBox ?? null),
    };
  }

  if (!detection) {
    return {
      mode: "none",
      gridWidth: 0,
      gridHeight: 0,
      cropBox: null,
      cropRatio: null,
      preferredEditorMode,
      chartFrameDetected: Boolean(frameBox),
      chartLegendDetected,
      chartLayoutAccepted,
      wholeLegendTop: mapDebugY(wholeLegendTop),
      wholeDirectCandidateMode: wholeDirectCandidate?.mode ?? null,
      wholeDirectCandidateGrid: wholeDirectCandidate
        ? [wholeDirectCandidate.gridWidth, wholeDirectCandidate.gridHeight]
        : null,
      wholeDirectCandidateCrop: mapDebugCrop(wholeDirectCandidate?.cropBox ?? null),
      wholeSeparatorBoardBox: mapDebugCrop(wholeSeparatorBoardBox),
      trimmedContentBox: mapDebugCrop(trimmedContentBox),
      trimmedLegendTop: mapDebugY(trimmedLegendTop),
      trimmedLegendCandidateMode: trimmedLegendCandidate?.mode ?? null,
      trimmedLegendCandidateGrid: trimmedLegendCandidate
        ? [trimmedLegendCandidate.gridWidth, trimmedLegendCandidate.gridHeight]
        : null,
      trimmedLegendCandidateCrop: mapDebugCrop(trimmedLegendCandidate?.cropBox ?? null),
      trimmedSeparatorBoardBox: mapDebugCrop(trimmedSeparatorBoardBox),
      trimmedBoardDetectionMode: trimmedBoardDetection?.mode ?? null,
      trimmedBoardDetectionGrid: trimmedBoardDetection
        ? [trimmedBoardDetection.gridWidth, trimmedBoardDetection.gridHeight]
        : null,
      trimmedBoardDetectionCrop: mapDebugCrop(trimmedBoardDetection?.cropBox ?? null),
      trimmedDenseBandBox: mapDebugCrop(trimmedDenseBandBox),
      trimmedConnectedBox: mapDebugCrop(trimmedConnectedBox),
      trimmedHoughGrid: trimmedHoughDetection
        ? [trimmedHoughDetection.gridWidth, trimmedHoughDetection.gridHeight]
        : null,
      trimmedHoughCrop: mapDebugCrop(trimmedHoughDetection?.cropBox ?? null),
      trimmedSeparatorFamilyMode: trimmedSeparatorFamilyDetection?.mode ?? null,
      trimmedSeparatorFamilyGrid: trimmedSeparatorFamilyDetection
        ? [trimmedSeparatorFamilyDetection.gridWidth, trimmedSeparatorFamilyDetection.gridHeight]
        : null,
      trimmedSeparatorFamilyCrop: mapDebugCrop(trimmedSeparatorFamilyDetection?.cropBox ?? null),
      trimmedConnectedFamilyMode: trimmedConnectedFamilyDetection?.mode ?? null,
      trimmedConnectedFamilyGrid: trimmedConnectedFamilyDetection
        ? [trimmedConnectedFamilyDetection.gridWidth, trimmedConnectedFamilyDetection.gridHeight]
        : null,
      trimmedConnectedFamilyCrop: mapDebugCrop(trimmedConnectedFamilyDetection?.cropBox ?? null),
    };
  }

  const cropWidth = detection.cropBox[2] - detection.cropBox[0];
  const cropHeight = detection.cropBox[3] - detection.cropBox[1];
  return {
    mode: detection.mode,
    gridWidth: detection.gridWidth,
    gridHeight: detection.gridHeight,
    cropBox: detection.cropBox,
    cropRatio: cropWidth / Math.max(1, cropHeight),
    preferredEditorMode,
    chartFrameDetected: Boolean(frameBox),
    chartLegendDetected,
    chartLayoutAccepted,
    wholeLegendTop: mapDebugY(wholeLegendTop),
    wholeDirectCandidateMode: wholeDirectCandidate?.mode ?? null,
    wholeDirectCandidateGrid: wholeDirectCandidate
      ? [wholeDirectCandidate.gridWidth, wholeDirectCandidate.gridHeight]
      : null,
    wholeDirectCandidateCrop: mapDebugCrop(wholeDirectCandidate?.cropBox ?? null),
    wholeSeparatorBoardBox: mapDebugCrop(wholeSeparatorBoardBox),
    trimmedContentBox: mapDebugCrop(trimmedContentBox),
    trimmedLegendTop: mapDebugY(trimmedLegendTop),
    trimmedLegendCandidateMode: trimmedLegendCandidate?.mode ?? null,
    trimmedLegendCandidateGrid: trimmedLegendCandidate
      ? [trimmedLegendCandidate.gridWidth, trimmedLegendCandidate.gridHeight]
      : null,
    trimmedLegendCandidateCrop: mapDebugCrop(trimmedLegendCandidate?.cropBox ?? null),
    trimmedSeparatorBoardBox: mapDebugCrop(trimmedSeparatorBoardBox),
    trimmedBoardDetectionMode: trimmedBoardDetection?.mode ?? null,
    trimmedBoardDetectionGrid: trimmedBoardDetection
      ? [trimmedBoardDetection.gridWidth, trimmedBoardDetection.gridHeight]
      : null,
    trimmedBoardDetectionCrop: mapDebugCrop(trimmedBoardDetection?.cropBox ?? null),
    trimmedDenseBandBox: mapDebugCrop(trimmedDenseBandBox),
    trimmedConnectedBox: mapDebugCrop(trimmedConnectedBox),
    trimmedHoughGrid: trimmedHoughDetection
      ? [trimmedHoughDetection.gridWidth, trimmedHoughDetection.gridHeight]
      : null,
    trimmedHoughCrop: mapDebugCrop(trimmedHoughDetection?.cropBox ?? null),
    trimmedSeparatorFamilyMode: trimmedSeparatorFamilyDetection?.mode ?? null,
    trimmedSeparatorFamilyGrid: trimmedSeparatorFamilyDetection
      ? [trimmedSeparatorFamilyDetection.gridWidth, trimmedSeparatorFamilyDetection.gridHeight]
      : null,
    trimmedSeparatorFamilyCrop: mapDebugCrop(trimmedSeparatorFamilyDetection?.cropBox ?? null),
    trimmedConnectedFamilyMode: trimmedConnectedFamilyDetection?.mode ?? null,
    trimmedConnectedFamilyGrid: trimmedConnectedFamilyDetection
      ? [trimmedConnectedFamilyDetection.gridWidth, trimmedConnectedFamilyDetection.gridHeight]
      : null,
    trimmedConnectedFamilyCrop: mapDebugCrop(trimmedConnectedFamilyDetection?.cropBox ?? null),
  };
}

export async function exportChartFromCells(options: {
  cells: EditableCell[];
  gridWidth: number;
  gridHeight: number;
  fileName: string;
  colorSystemId?: string;
  cellSize?: number;
  messages?: Partial<ProcessMessages>;
}) {
  const processMessages = {
    ...defaultProcessMessages,
    ...options.messages,
  };
  const paletteDefinition = getPaletteDefinition(options.colorSystemId);
  const normalizedCells = options.cells.map((cell) => normalizeEditableCell(cell));
  const colors = summarizeCells(normalizedCells, paletteDefinition);
  const totalBeads = colors.reduce((sum, color) => sum + color.count, 0);
  const canvas = renderChart(
    normalizedCells,
    colors,
    options.gridWidth,
    options.gridHeight,
    chooseCellSize(options.gridWidth, options.gridHeight, options.cellSize),
    processMessages.chartTitle(options.gridWidth, options.gridHeight),
    processMessages.chartMetaLine(paletteDefinition.label, totalBeads),
    processMessages.canvasContextUnavailable,
  );
  const blob = await canvasToBlob(canvas, processMessages.encodingFailed);
  return {
    blob,
    fileName: options.fileName,
    paletteColorsUsed: colors.length,
    colors,
  };
}

function defaultOutputName(fileName: string, gridWidth: number, gridHeight: number) {
  const dotIndex = fileName.lastIndexOf(".");
  const stem = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  return `【拼豆豆】${stem}.png`;
}

function parseGridHintFromName(fileName: string): [number, number] | null {
  const stem = fileName.replace(/\.[^.]+$/, "");
  const match = stem.match(/(?:_mard_chart_|chart[_\s-]?)(\d+)\s*x\s*(\d+)/i) ?? stem.match(/\((\d+)\s*x\s*(\d+)\)/i);
  if (!match) {
    return null;
  }

  return [Number.parseInt(match[1], 10), Number.parseInt(match[2], 10)];
}

function isPlausiblePixelArtDetection(
  image: RasterImage,
  detection: DetectionResult,
) {
  const cropWidth = detection.cropBox[2] - detection.cropBox[0];
  const cropHeight = detection.cropBox[3] - detection.cropBox[1];
  if (cropWidth <= 0 || cropHeight <= 0) {
    return false;
  }

  const expectedGridWidth = detection.gridWidth;
  const expectedGridHeight = detection.gridHeight;
  if (!isReasonableGrid(expectedGridWidth, expectedGridHeight)) {
    return false;
  }

  const cellWidth = cropWidth / expectedGridWidth;
  const cellHeight = cropHeight / expectedGridHeight;
  const cellRatio = Math.max(cellWidth, cellHeight) / Math.max(1e-6, Math.min(cellWidth, cellHeight));
  if (cellRatio > 1.65) {
    return false;
  }

  const expectedAspect = expectedGridWidth / expectedGridHeight;
  const cropAspect = cropWidth / cropHeight;
  const aspectRatio = Math.max(cropAspect, expectedAspect) / Math.max(1e-6, Math.min(cropAspect, expectedAspect));
  if (aspectRatio > 1.7) {
    return false;
  }

  const sourceAspect = image.width / Math.max(1, image.height);
  const sourceAspectRatio =
    Math.max(cropAspect, sourceAspect) / Math.max(1e-6, Math.min(cropAspect, sourceAspect));
  if (sourceAspectRatio > 1.7) {
    return false;
  }

  return true;
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

function detectPixelArtPrepared(image: RasterImage): DetectionResult | null {
  const prepared = prepareDetectionRaster(image);
  const detection = detectPixelArt(prepared.raster);
  if (!detection) {
    return null;
  }

  return {
    gridWidth: detection.gridWidth,
    gridHeight: detection.gridHeight,
    cropBox: mapPreparedCropBoxToSource(detection.cropBox, image, prepared),
    mode: detection.mode,
    xSegments: prepared.scaleX === 1 && prepared.scaleY === 1 ? detection.xSegments : undefined,
    ySegments: prepared.scaleX === 1 && prepared.scaleY === 1 ? detection.ySegments : undefined,
  };
}

function detectChartLikePixelArtPrepared(
  image: RasterImage,
  fileName?: string,
): Omit<ChartImportDetection, "logical"> | null {
  if (!mayContainLegendChart(image, fileName)) {
    return null;
  }
  const prepared = prepareDetectionRaster(image);
  const detection = detectChartLikePixelArt(prepared.raster, fileName);
  if (!detection) {
    return null;
  }

  return {
    gridWidth: detection.gridWidth,
    gridHeight: detection.gridHeight,
    mode: detection.mode,
    cropBox: mapPreparedCropBoxToSource(detection.cropBox, image, prepared),
  };
}

function shouldDefaultToPindouModePrepared(image: RasterImage, fileName: string) {
  if (!mayContainLegendChart(image, fileName)) {
    return false;
  }
  const prepared = prepareDetectionRaster(image);
  return shouldDefaultToPindouMode(prepared.raster, fileName);
}

function mayContainLegendChart(image: RasterImage, fileName?: string) {
  if (looksLikeExportedChartFileName(fileName ?? "")) {
    return true;
  }
  if (image.width < 120 || image.height < 180) {
    return false;
  }

  const legendProbeTop = Math.max(0, Math.floor(image.height * 0.68));
  const legendProbe = cropRaster(image, [0, legendProbeTop, image.width, image.height]);
  return countLegendSwatches(legendProbe) >= 2 || scoreChartLegend(legendProbe) >= 0.18;
}

function detectPixelArt(image: RasterImage): DetectionResult | null {
  const candidates = [
    detectRawPixelArt(image),
    detectGridlinePixelArt(image),
    detectGappedGridPixelArt(image),
    detectBlockPixelArt(image),
  ].filter((candidate): candidate is DetectionResult => Boolean(candidate));

  for (const candidate of candidates) {
    if (isPlausiblePixelArtDetection(image, candidate)) {
      return candidate;
    }
  }

  return null;
}

function detectChartLikePixelArt(
  image: RasterImage,
  fileName?: string,
): ChartImportDetection | null {
  if (image.width < 120 || image.height < 180) {
    return null;
  }

  const frameBox = detectDarkFrameBox(image);
  if (frameBox) {
    const legendRegion = cropRaster(
      image,
      [0, frameBox.outer[3], image.width, image.height],
    );
    if (!isPlausibleChartImportLayout(image, frameBox, legendRegion, fileName)) {
      return detectLegendSeparatedChart(image);
    }
    if (!looksLikeChartLegend(legendRegion)) {
      return detectLegendSeparatedChart(image);
    }

    const boardRegion = cropRaster(image, frameBox.inner);
    const exportedGridHint =
      fileName && looksLikeExportedChartFileName(fileName)
        ? parseGridHintFromName(fileName)
        : null;
    if (
      exportedGridHint &&
      isReasonableGrid(exportedGridHint[0], exportedGridHint[1])
    ) {
      return {
        logical: sampleRegularGrid(boardRegion, exportedGridHint[0], exportedGridHint[1]),
        gridWidth: exportedGridHint[0],
        gridHeight: exportedGridHint[1],
        mode: "detected-chart-frame+exported-name-hint",
        cropBox: frameBox.inner,
      };
    }

    const boardDetection =
      detectLightSeparatorPixelArt(boardRegion) ??
      detectGridlinePixelArt(boardRegion) ??
      detectGappedGridPixelArt(boardRegion) ??
      detectBlockPixelArt(boardRegion);
    if (!boardDetection) {
      return detectLegendSeparatedChart(image);
    }

    const logical =
      boardDetection.xSegments && boardDetection.ySegments
        ? sampleSegments(boardRegion, boardDetection.xSegments, boardDetection.ySegments)
        : sampleRegularGrid(
            cropRaster(boardRegion, boardDetection.cropBox),
            boardDetection.gridWidth,
            boardDetection.gridHeight,
          );

    return {
      logical,
      gridWidth: boardDetection.gridWidth,
      gridHeight: boardDetection.gridHeight,
      mode: `${boardDetection.mode}+chart-frame`,
      cropBox: offsetCropBox(frameBox.inner, boardDetection.cropBox),
    };
  }

  const genericRectangularChart = detectGenericRectangularChartFrame(image);
  if (genericRectangularChart) {
    return genericRectangularChart;
  }

  const trimmedContentBox = detectLooseContentBox(image);
  if (trimmedContentBox) {
    const trimmedRegion = cropRaster(image, trimmedContentBox);
    const trimmedDetection = detectLegendSeparatedChart(trimmedRegion);
    if (trimmedDetection) {
      return {
        ...trimmedDetection,
        cropBox: offsetCropBox(trimmedContentBox, trimmedDetection.cropBox),
      };
    }

    const trimmedFramedDetection = detectBestLegendBoardCandidate(trimmedRegion);
    if (trimmedFramedDetection) {
      return {
        ...trimmedFramedDetection,
        cropBox: offsetCropBox(trimmedContentBox, trimmedFramedDetection.cropBox),
      };
    }
  }

  return detectLegendSeparatedChart(image);
}

function detectGenericRectangularChartFrame(image: RasterImage): ChartImportDetection | null {
  const frameCrop = detectClosedRectangularBoardFrame(image);
  if (!frameCrop) {
    return null;
  }

  const legendRegion =
    frameCrop[3] < image.height - 24
      ? cropRaster(image, [0, frameCrop[3], image.width, image.height])
      : null;
  if (!legendRegion || !looksLikeChartLegend(legendRegion)) {
    return null;
  }

  const boardRegion = cropRaster(image, frameCrop);
  const boardDetection =
    detectLightSeparatorPixelArt(boardRegion) ??
    detectGridlinePixelArt(boardRegion) ??
    detectGappedGridPixelArt(boardRegion) ??
    detectBlockPixelArt(boardRegion);
  if (!boardDetection || !isPlausibleLegendBoardDetection(boardRegion, boardDetection)) {
    return null;
  }

  const logical =
    boardDetection.xSegments && boardDetection.ySegments
      ? sampleSegments(boardRegion, boardDetection.xSegments, boardDetection.ySegments)
      : sampleRegularGrid(
          cropRaster(boardRegion, boardDetection.cropBox),
          boardDetection.gridWidth,
          boardDetection.gridHeight,
        );

  return {
    logical,
    gridWidth: boardDetection.gridWidth,
    gridHeight: boardDetection.gridHeight,
    mode: `${boardDetection.mode}+generic-rect-frame`,
    cropBox: offsetCropBox(frameCrop, boardDetection.cropBox),
  };
}

function shouldDefaultToPindouMode(image: RasterImage, fileName: string) {
  if (looksLikeExportedChartFileName(fileName)) {
    return true;
  }

  const frameBox = detectDarkFrameBox(image);
  if (!frameBox) {
    return false;
  }

  const legendRegion = cropRaster(image, [0, frameBox.outer[3], image.width, image.height]);
  if (!isPlausibleChartImportLayout(image, frameBox, legendRegion, fileName)) {
    return false;
  }
  return looksLikeChartLegend(legendRegion);
}

function looksLikeExportedChartFileName(fileName: string) {
  const stem = fileName.replace(/\.[^.]+$/, "");
  return /(?:^|[_\s-])(mard_)?chart(?:[_\s-]|$)/i.test(stem) || /_mard_chart_/i.test(stem);
}

function isPlausibleChartImportLayout(
  image: RasterImage,
  frameBox: FrameBoxDetection,
  legendRegion: RasterImage,
  fileName?: string,
) {
  if (looksLikeExportedChartFileName(fileName ?? "")) {
    return true;
  }

  const [left, top, right, bottom] = frameBox.outer;
  const width = right - left;
  const height = bottom - top;
  const legendHeight = image.height - bottom;

  if (width <= 0 || height <= 0 || legendHeight <= 0) {
    return false;
  }

  const marginLeft = left;
  const marginRight = image.width - right;
  const marginTop = top;
  const widthRatio = width / image.width;
  const heightRatio = height / image.height;
  const legendRatio = legendHeight / image.height;
  const legendIsTallEnough = legendRegion.height >= 72;
  const horizontalCenterOffset =
    Math.abs((left + right) / 2 - image.width / 2) / Math.max(1, image.width);
  const balancedHorizontalMargins =
    Math.abs(marginLeft - marginRight) <= Math.max(48, image.width * 0.18);
  const frameAreaRatio = (width * height) / Math.max(1, image.width * image.height);
  const topAnchoredEnough = marginTop <= Math.max(56, image.height * 0.18);

  return (
    widthRatio >= 0.58 &&
    heightRatio >= 0.34 &&
    frameAreaRatio >= 0.24 &&
    legendRatio >= 0.08 &&
    legendRatio <= 0.46 &&
    legendIsTallEnough &&
    topAnchoredEnough &&
    horizontalCenterOffset <= 0.14 &&
    balancedHorizontalMargins
  );
}

function detectLegendSeparatedChart(image: RasterImage): ChartImportDetection | null {
  const legendTop = detectLegendTop(image);
  if (legendTop === null) {
    return null;
  }

  const boardRegion = cropRaster(image, [0, 0, image.width, legendTop]);
  const candidate = detectBestLegendBoardCandidate(boardRegion);
  if (!candidate) {
    return null;
  }

  const candidateRegion = cropRaster(boardRegion, candidate.cropBox);
  const candidateFrame = detectClosedRectangularBoardFrame(candidateRegion);
  if (!candidateFrame) {
    return null;
  }
  const candidateWidth = candidate.cropBox[2] - candidate.cropBox[0];
  const candidateHeight = candidate.cropBox[3] - candidate.cropBox[1];
  const maxHorizontalInset = Math.max(10, Math.round(candidateWidth * 0.08));
  const maxVerticalInset = Math.max(10, Math.round(candidateHeight * 0.08));
  if (
    candidateFrame[0] > maxHorizontalInset ||
    candidateWidth - candidateFrame[2] > maxHorizontalInset ||
    candidateFrame[1] > maxVerticalInset ||
    candidateHeight - candidateFrame[3] > maxVerticalInset
  ) {
    return null;
  }

  return {
    logical: candidate.logical,
    gridWidth: candidate.gridWidth,
    gridHeight: candidate.gridHeight,
    mode: `${candidate.mode}+chart-legend`,
    cropBox: offsetCropBox([0, 0, image.width, legendTop], candidate.cropBox),
  };
}

function detectLooseContentBox(image: RasterImage): CropBox | null {
  const rowCounts = new Int32Array(image.height);
  const columnCounts = new Int32Array(image.width);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (!isLooseContentPixel(getPixel(image, x, y))) {
        continue;
      }
      rowCounts[y] += 1;
      columnCounts[x] += 1;
    }
  }

  const rowThreshold = Math.max(8, Math.round(image.width * 0.012));
  const columnThreshold = Math.max(8, Math.round(image.height * 0.008));
  const top = firstIndexAtOrAbove(rowCounts, rowThreshold);
  const bottom = lastIndexAtOrAbove(rowCounts, rowThreshold);
  const left = firstIndexAtOrAbove(columnCounts, columnThreshold);
  const right = lastIndexAtOrAbove(columnCounts, columnThreshold);

  if (top === null || bottom === null || left === null || right === null) {
    return null;
  }

  const padding = 6;
  const cropBox: CropBox = [
    Math.max(0, left - padding),
    Math.max(0, top - padding),
    Math.min(image.width, right + padding + 1),
    Math.min(image.height, bottom + padding + 1),
  ];
  const cropWidth = cropBox[2] - cropBox[0];
  const cropHeight = cropBox[3] - cropBox[1];
  const areaRatio = (cropWidth * cropHeight) / Math.max(1, image.width * image.height);

  if (
    cropWidth < image.width * 0.45 ||
    cropHeight < image.height * 0.28 ||
    areaRatio < 0.14
  ) {
    return null;
  }

  if (
    cropWidth >= image.width * 0.98 &&
    cropHeight >= image.height * 0.98
  ) {
    return null;
  }

  return cropBox;
}

function detectBestLegendBoardCandidate(boardRegion: RasterImage) {
  const axisLabelBoard = detectLegendBoardFromAxisLabelsCandidate(boardRegion);
  if (axisLabelBoard && isConfidentAxisLabelLegendBoard(boardRegion, axisLabelBoard)) {
    return axisLabelBoard;
  }
  const looseContentBox = detectLooseContentBox(boardRegion);
  const coreBoardBox = detectLegendBoardCoreCrop(boardRegion);
  const innerBoardBox = detectLegendBoardInnerCrop(boardRegion);
  const denseContentBandBox = detectDenseLooseContentBandBox(boardRegion);
  const connectedBoardBox = detectLargestLooseContentComponentBox(boardRegion);
  const separatorBoardBox = detectLightSeparatorBoardBox(boardRegion);

  const candidates = [
    axisLabelBoard,
    looseContentBox ? detectLegendBoardFromCandidateBox(boardRegion, looseContentBox) : null,
    coreBoardBox ? detectLegendBoardFromCandidateBox(boardRegion, coreBoardBox) : null,
    innerBoardBox ? detectLegendBoardFromCandidateBox(boardRegion, innerBoardBox) : null,
    separatorBoardBox ? detectLegendBoardFromCandidateBox(boardRegion, separatorBoardBox) : null,
    connectedBoardBox ? detectLegendBoardFromCandidateBox(boardRegion, connectedBoardBox) : null,
    denseContentBandBox ? detectLegendBoardFromCandidateBox(boardRegion, denseContentBandBox) : null,
  ].filter((candidate): candidate is ChartImportDetection & { score: number } => Boolean(candidate));
  if (candidates.length) {
    const hybridCandidates = buildHybridLegendBoardCandidates(boardRegion, candidates);
    const allCandidates = [...candidates, ...hybridCandidates];
    allCandidates.sort((left, right) => right.score - left.score);
    return allCandidates[0];
  }
  return null;
}

function isConfidentAxisLabelLegendBoard(
  boardRegion: RasterImage,
  candidate: ChartImportDetection & { score: number },
) {
  const cropWidth = candidate.cropBox[2] - candidate.cropBox[0];
  const cropHeight = candidate.cropBox[3] - candidate.cropBox[1];
  const areaRatio = (cropWidth * cropHeight) / Math.max(1, boardRegion.width * boardRegion.height);
  const cellWidth = cropWidth / Math.max(1, candidate.gridWidth);
  const cellHeight = cropHeight / Math.max(1, candidate.gridHeight);
  const cellAspect = Math.max(cellWidth, cellHeight) / Math.max(1e-6, Math.min(cellWidth, cellHeight));
  return (
    candidate.mode.includes("axis-label") &&
    areaRatio >= 0.42 &&
    cellWidth >= 6 &&
    cellHeight >= 6 &&
    cellAspect <= 1.35
  );
}

function detectLegendBoardFromAxisLabelsCandidate(
  boardRegion: RasterImage,
): (ChartImportDetection & { score: number }) | null {
  const axisLabelBoard = detectLegendBoardFromAxisLabels(boardRegion);
  if (!axisLabelBoard) {
    return null;
  }

  const croppedBoard = cropRaster(boardRegion, axisLabelBoard.cropBox);
  const boardInnerCrop =
    detectLegendBoardCoreCrop(croppedBoard) ??
    detectLegendBoardInnerCrop(croppedBoard) ??
    detectLightSeparatorBoardBox(croppedBoard);
  const refinedBoard = boardInnerCrop ? cropRaster(croppedBoard, boardInnerCrop) : croppedBoard;
  const refined =
    detectLightSeparatorPixelArt(refinedBoard) ??
    detectGridlinePixelArt(refinedBoard) ??
    detectGappedGridPixelArt(refinedBoard) ??
    detectBlockPixelArt(refinedBoard);

  if (refined && isPlausibleLegendBoardDetection(refinedBoard, refined)) {
    const logical =
      refined.xSegments && refined.ySegments
        ? sampleSegments(refinedBoard, refined.xSegments, refined.ySegments)
        : sampleRegularGrid(
            cropRaster(refinedBoard, refined.cropBox),
            refined.gridWidth,
            refined.gridHeight,
          );
    const refinedCropBox = boardInnerCrop
      ? offsetCropBox(boardInnerCrop, refined.cropBox)
      : refined.cropBox;
    const cropBox = offsetCropBox(axisLabelBoard.cropBox, refinedCropBox);
    const detection: DetectionResult = {
      gridWidth: refined.gridWidth,
      gridHeight: refined.gridHeight,
      cropBox,
      mode: `${refined.mode}+legend-axis-labels`,
    };
    return {
      logical,
      gridWidth: detection.gridWidth,
      gridHeight: detection.gridHeight,
      mode: detection.mode,
      cropBox,
      score: scoreLegendBoardCandidate(boardRegion, detection) + 10,
    };
  }

  const inferredGridWidth = inferAxisLabelBoardGridCount(croppedBoard, "x", axisLabelBoard.gridWidth);
  const inferredGridHeight = inferAxisLabelBoardGridCount(croppedBoard, "y", axisLabelBoard.gridHeight);
  const logical = sampleRegularGrid(
    cropRaster(boardRegion, axisLabelBoard.cropBox),
    inferredGridWidth,
    inferredGridHeight,
  );
  const fallbackDetection: DetectionResult = {
    gridWidth: inferredGridWidth,
    gridHeight: inferredGridHeight,
    cropBox: axisLabelBoard.cropBox,
    mode: `${axisLabelBoard.mode}+legend-axis-labels`,
  };
  if (!isPlausibleLegendBoardDetection(boardRegion, fallbackDetection)) {
    return null;
  }
  return {
    logical,
    gridWidth: inferredGridWidth,
    gridHeight: inferredGridHeight,
    mode: fallbackDetection.mode,
    cropBox: fallbackDetection.cropBox,
    score: scoreLegendBoardCandidate(boardRegion, fallbackDetection) + 4,
  };
}

function inferAxisLabelBoardGridCount(
  image: RasterImage,
  axis: "x" | "y",
  fallbackCount: number,
) {
  const axisLength = axis === "x" ? image.width : image.height;
  const candidates = [
    detectLightAxisGrid(image, axis),
    detectDarkAxisGrid(image, axis),
  ].filter((value): value is AxisGrid => Boolean(value));

  const inferredCounts: number[] = [];
  for (const candidate of candidates) {
    const inferred = Math.round(axisLength / Math.max(1, candidate.period));
    if (!isReasonableGrid(axis === "x" ? inferred : fallbackCount, axis === "y" ? inferred : fallbackCount)) {
      continue;
    }
    if (inferred < fallbackCount || inferred > fallbackCount + 4) {
      continue;
    }
    inferredCounts.push(inferred);
  }

  if (!inferredCounts.length) {
    return fallbackCount;
  }

  inferredCounts.sort((left, right) => left - right);
  return inferredCounts[0];
}

function buildHybridLegendBoardCandidates(
  boardRegion: RasterImage,
  candidates: Array<ChartImportDetection & { score: number }>,
) {
  const hybrids: Array<ChartImportDetection & { score: number }> = [];
  for (const xCandidate of candidates) {
    for (const yCandidate of candidates) {
      if (xCandidate === yCandidate) {
        continue;
      }

      const cropBox: CropBox = [
        xCandidate.cropBox[0],
        yCandidate.cropBox[1],
        xCandidate.cropBox[2],
        yCandidate.cropBox[3],
      ];
      const cropWidth = cropBox[2] - cropBox[0];
      const cropHeight = cropBox[3] - cropBox[1];
      if (cropWidth <= 0 || cropHeight <= 0) {
        continue;
      }

      const detection: DetectionResult = {
        gridWidth: xCandidate.gridWidth,
        gridHeight: yCandidate.gridHeight,
        cropBox,
        mode: `hybrid:${xCandidate.mode}|${yCandidate.mode}`,
      };
      if (!isPlausibleLegendBoardDetection(boardRegion, detection)) {
        continue;
      }

      const logical = sampleRegularGrid(
        cropRaster(boardRegion, cropBox),
        detection.gridWidth,
        detection.gridHeight,
      );
      hybrids.push({
        logical,
        gridWidth: detection.gridWidth,
        gridHeight: detection.gridHeight,
        mode: detection.mode,
        cropBox,
        score: scoreLegendBoardCandidate(boardRegion, detection),
      });
    }
  }

  return hybrids;
}

function scoreLegendBoardCandidate(
  boardRegion: RasterImage,
  detection: DetectionResult,
) {
  const cropWidth = detection.cropBox[2] - detection.cropBox[0];
  const cropHeight = detection.cropBox[3] - detection.cropBox[1];
  const areaRatio = (cropWidth * cropHeight) / Math.max(1, boardRegion.width * boardRegion.height);
  const cellWidth = cropWidth / Math.max(1, detection.gridWidth);
  const cellHeight = cropHeight / Math.max(1, detection.gridHeight);
  const minCellSize = Math.min(cellWidth, cellHeight);
  const cellAspect = Math.max(cellWidth, cellHeight) / Math.max(1e-6, Math.min(cellWidth, cellHeight));
  const squarePenalty = Math.abs(Math.log(cellAspect));
  const densityBonus = Math.min(detection.gridWidth, detection.gridHeight) * 0.11;
  const cellSizeBonus = Math.min(minCellSize, 28) * 0.18;

  return areaRatio * 4.8 + densityBonus + cellSizeBonus - squarePenalty * 14;
}

function buildScoredLegendCandidate(
  boardRegion: RasterImage,
  detection: DetectionResult,
  mode: string,
) {
  const logical = sampleRegularGrid(
    cropRaster(boardRegion, detection.cropBox),
    detection.gridWidth,
    detection.gridHeight,
  );

  return {
    logical,
    gridWidth: detection.gridWidth,
    gridHeight: detection.gridHeight,
    mode,
    cropBox: detection.cropBox,
    score: scoreLegendBoardCandidate(boardRegion, detection),
  };
}

function detectOrthogonalHoughChartBoard(image: RasterImage): DetectionResult | null {
  const xAxis = detectOrthogonalHoughAxisGrid(image, "x");
  if (!xAxis) {
    return null;
  }

  const xCrop: CropBox = [
    Math.max(0, xAxis.firstLine - 1),
    0,
    Math.min(image.width, xAxis.lastLine + 2),
    image.height,
  ];
  const xLimited = cropRaster(image, xCrop);
  const yAxis = detectOrthogonalHoughAxisGrid(xLimited, "y");
  if (!yAxis) {
    return null;
  }

  const cropBox: CropBox = [
    xCrop[0],
    Math.max(0, yAxis.firstLine - 1),
    xCrop[2],
    Math.min(image.height, yAxis.lastLine + 2),
  ];
  const cropWidth = cropBox[2] - cropBox[0];
  const cropHeight = cropBox[3] - cropBox[1];
  const gridWidth = Math.round(cropWidth / Math.max(1, xAxis.period));
  const gridHeight = Math.round(cropHeight / Math.max(1, yAxis.period));

  if (!isReasonableGrid(gridWidth, gridHeight)) {
    return null;
  }

  return {
    gridWidth,
    gridHeight,
    cropBox,
    mode: "detected-hough-gridlines",
  };
}

function detectLegendBoardFromCandidateBox(
  boardRegion: RasterImage,
  candidateBox: CropBox,
): (ChartImportDetection & { score: number }) | null {
  const directEdges = buildFrameEdgesForBox(boardRegion, candidateBox);
  const directFrameCrop =
    directEdges && hasClosedRectangularFrame(boardRegion, candidateBox, directEdges)
      ? [candidateBox[0] + 1, candidateBox[1] + 1, candidateBox[2], candidateBox[3]] satisfies CropBox
      : null;

  const candidateRegion = cropRaster(boardRegion, candidateBox);
  const nestedFrameCrop = detectClosedRectangularBoardFrame(candidateRegion);

  for (const rectangularFrameCrop of [directFrameCrop, nestedFrameCrop]) {
    if (!rectangularFrameCrop) {
      continue;
    }

    const frameRegion =
      rectangularFrameCrop === directFrameCrop
        ? cropRaster(boardRegion, rectangularFrameCrop)
        : cropRaster(candidateRegion, rectangularFrameCrop);
    const frameDetection =
      detectLightSeparatorPixelArt(frameRegion) ??
      detectGridlinePixelArt(frameRegion) ??
      detectGappedGridPixelArt(frameRegion) ??
      detectBlockPixelArt(frameRegion);
    if (frameDetection && isPlausibleLegendBoardDetection(frameRegion, frameDetection)) {
      const logical =
        frameDetection.xSegments && frameDetection.ySegments
          ? sampleSegments(frameRegion, frameDetection.xSegments, frameDetection.ySegments)
          : sampleRegularGrid(
            cropRaster(frameRegion, frameDetection.cropBox),
            frameDetection.gridWidth,
            frameDetection.gridHeight,
          );
      const cropBox =
        rectangularFrameCrop === directFrameCrop
          ? offsetCropBox(rectangularFrameCrop, frameDetection.cropBox)
          : offsetCropBox(candidateBox, offsetCropBox(rectangularFrameCrop, frameDetection.cropBox));
      const detection: DetectionResult = {
        gridWidth: frameDetection.gridWidth,
        gridHeight: frameDetection.gridHeight,
        cropBox,
        mode: `${frameDetection.mode}+legend-rect-frame`,
      };

      return {
        logical,
        gridWidth: detection.gridWidth,
        gridHeight: detection.gridHeight,
        mode: detection.mode,
        cropBox,
        score: scoreLegendBoardCandidate(boardRegion, detection) + 8,
      };
    }
  }
  return null;
}

function detectClosedRectangularBoardFrame(image: RasterImage): CropBox | null {
  const perimeterFrame = buildFrameEdgesForBox(image, [0, 0, image.width, image.height]);
  if (perimeterFrame && hasClosedRectangularFrame(image, [0, 0, image.width, image.height], perimeterFrame)) {
    return [1, 1, image.width, image.height];
  }

  const topCandidates = findHorizontalFrameEdgeCandidates(
    image,
    0,
    Math.max(0, Math.floor(image.height * 0.34)),
    "top",
  );
  const bottomCandidates = findHorizontalFrameEdgeCandidates(
    image,
    Math.min(image.height - 1, Math.floor(image.height * 0.66)),
    image.height - 1,
    "bottom",
  );
  const leftCandidates = findVerticalFrameEdgeCandidates(
    image,
    0,
    Math.max(0, Math.floor(image.width * 0.28)),
    "left",
  );
  const rightCandidates = findVerticalFrameEdgeCandidates(
    image,
    Math.min(image.width - 1, Math.floor(image.width * 0.72)),
    image.width - 1,
    "right",
  );
  if (
    topCandidates.length === 0 ||
    bottomCandidates.length === 0 ||
    leftCandidates.length === 0 ||
    rightCandidates.length === 0
  ) {
    return null;
  }

  let bestFrame: { box: CropBox; score: number } | null = null;
  for (const top of topCandidates) {
    for (const bottom of bottomCandidates) {
      if (bottom.position - top.position < image.height * 0.52) {
        continue;
      }
      for (const left of leftCandidates) {
        for (const right of rightCandidates) {
          if (right.position - left.position < image.width * 0.58) {
            continue;
          }

          const edges = [top, bottom, left, right];
          if (!hasConsistentFrameEdgeColors(edges)) {
            continue;
          }

          const outerBox: CropBox = [
            left.position,
            top.position,
            right.position + 1,
            bottom.position + 1,
          ];
          if (!hasClosedRectangularFrame(image, outerBox, edges)) {
            continue;
          }

          const coverage =
            (top.coverage + bottom.coverage + left.coverage + right.coverage) / 4;
          const contrast =
            (top.contrast + bottom.contrast + left.contrast + right.contrast) / 4;
          const dominance =
            (top.dominance + bottom.dominance + left.dominance + right.dominance) / 4;
          const areaRatio =
            ((outerBox[2] - outerBox[0]) * (outerBox[3] - outerBox[1])) /
            Math.max(1, image.width * image.height);
          const edgeInset =
            (top.position +
              left.position +
              (image.width - 1 - right.position) +
              (image.height - 1 - bottom.position)) /
            Math.max(1, image.width + image.height);
          const score =
            areaRatio * 8 +
            coverage * 2.4 +
            contrast * 0.05 +
            dominance * 1.8 -
            edgeInset * 1.2;
          if (!bestFrame || score > bestFrame.score) {
            bestFrame = { box: outerBox, score };
          }
        }
      }
    }
  }

  if (!bestFrame) {
    return null;
  }

  return [bestFrame.box[0] + 1, bestFrame.box[1] + 1, bestFrame.box[2], bestFrame.box[3]];
}

function buildFrameEdgesForBox(image: RasterImage, box: CropBox) {
  const [left, top, rightExclusive, bottomExclusive] = box;
  const right = rightExclusive - 1;
  const bottom = bottomExclusive - 1;
  if (right <= left || bottom <= top) {
    return null;
  }

  const topColor = sampleHorizontalFrameEdgeColor(image, left, right, top);
  const bottomColor = sampleHorizontalFrameEdgeColor(image, left, right, bottom);
  const leftColor = sampleVerticalFrameEdgeColor(image, top, bottom, left);
  const rightColor = sampleVerticalFrameEdgeColor(image, top, bottom, right);
  const edges: FrameEdgeCandidate[] = [
    {
      position: top,
      coverage: measureHorizontalFrameCoverage(image, left, right, top, topColor.color),
      contrast: measureHorizontalFrameContrast(image, left, right, top, Math.min(4, bottom - top)),
      dominantColor: topColor.color,
      dominance: topColor.dominance,
    },
    {
      position: bottom,
      coverage: measureHorizontalFrameCoverage(image, left, right, bottom, bottomColor.color),
      contrast: measureHorizontalFrameContrast(image, left, right, bottom, -Math.min(4, bottom - top)),
      dominantColor: bottomColor.color,
      dominance: bottomColor.dominance,
    },
    {
      position: left,
      coverage: measureVerticalFrameCoverage(image, top, bottom, left, leftColor.color),
      contrast: measureVerticalFrameContrast(image, top, bottom, left, Math.min(4, right - left)),
      dominantColor: leftColor.color,
      dominance: leftColor.dominance,
    },
    {
      position: right,
      coverage: measureVerticalFrameCoverage(image, top, bottom, right, rightColor.color),
      contrast: measureVerticalFrameContrast(image, top, bottom, right, -Math.min(4, right - left)),
      dominantColor: rightColor.color,
      dominance: rightColor.dominance,
    },
  ];
  return hasConsistentFrameEdgeColors(edges) ? edges : null;
}

function hasClosedRectangularFrame(
  image: RasterImage,
  outerBox: CropBox,
  edges: FrameEdgeCandidate[],
) {
  const [left, top, rightExclusive, bottomExclusive] = outerBox;
  const right = rightExclusive - 1;
  const bottom = bottomExclusive - 1;
  const frameWidth = right - left + 1;
  const frameHeight = bottom - top + 1;
  if (frameWidth < 24 || frameHeight < 24) {
    return false;
  }

  const [topEdge, bottomEdge, leftEdge, rightEdge] = edges;
  const topCoverage = measureHorizontalFrameCoverage(
    image,
    left,
    right,
    top,
    topEdge.dominantColor,
  );
  const bottomCoverage = measureHorizontalFrameCoverage(
    image,
    left,
    right,
    bottom,
    bottomEdge.dominantColor,
  );
  const leftCoverage = measureVerticalFrameCoverage(
    image,
    top,
    bottom,
    left,
    leftEdge.dominantColor,
  );
  const rightCoverage = measureVerticalFrameCoverage(
    image,
    top,
    bottom,
    right,
    rightEdge.dominantColor,
  );
  const minCoverage = Math.min(topCoverage, bottomCoverage, leftCoverage, rightCoverage);
  if (minCoverage < 0.38) {
    return false;
  }

  const topContrast = measureHorizontalFrameContrast(image, left, right, top, Math.min(3, bottom - top));
  const bottomContrast = measureHorizontalFrameContrast(image, left, right, bottom, -Math.min(3, bottom - top));
  const leftContrast = measureVerticalFrameContrast(image, top, bottom, left, Math.min(3, right - left));
  const rightContrast = measureVerticalFrameContrast(image, top, bottom, right, -Math.min(3, right - left));
  const minContrast = Math.min(topContrast, bottomContrast, leftContrast, rightContrast);

  return minContrast >= 16;
}

function measureHorizontalFrameCoverage(
  image: RasterImage,
  left: number,
  right: number,
  targetY: number,
  targetColor: Rgb,
) {
  let bestCoverage = 0;
  for (let delta = -1; delta <= 1; delta += 1) {
    const y = Math.max(0, Math.min(image.height - 1, targetY + delta));
    let matches = 0;
    for (let x = left; x <= right; x += 1) {
      const pixel = getPixel(image, x, y);
      if (rgbDistance(pixel, targetColor) <= 34) {
        matches += 1;
      }
    }
    bestCoverage = Math.max(bestCoverage, matches / Math.max(1, right - left + 1));
  }
  return bestCoverage;
}

function measureVerticalFrameCoverage(
  image: RasterImage,
  top: number,
  bottom: number,
  targetX: number,
  targetColor: Rgb,
) {
  let bestCoverage = 0;
  for (let delta = -1; delta <= 1; delta += 1) {
    const x = Math.max(0, Math.min(image.width - 1, targetX + delta));
    let matches = 0;
    for (let y = top; y <= bottom; y += 1) {
      const pixel = getPixel(image, x, y);
      if (rgbDistance(pixel, targetColor) <= 34) {
        matches += 1;
      }
    }
    bestCoverage = Math.max(bestCoverage, matches / Math.max(1, bottom - top + 1));
  }
  return bestCoverage;
}

function measureHorizontalFrameContrast(
  image: RasterImage,
  left: number,
  right: number,
  frameY: number,
  insideOffset: number,
) {
  const primaryY = Math.max(0, Math.min(image.height - 1, frameY + insideOffset));
  const reverseDelta = insideOffset >= 0 ? -1 : 1;
  const secondaryY = Math.max(0, Math.min(image.height - 1, frameY + reverseDelta));
  let frameRed = 0;
  let frameGreen = 0;
  let frameBlue = 0;
  let primaryRed = 0;
  let primaryGreen = 0;
  let primaryBlue = 0;
  let secondaryRed = 0;
  let secondaryGreen = 0;
  let secondaryBlue = 0;
  let count = 0;
  for (let x = left; x <= right; x += 1) {
    const framePixel = getPixel(image, x, frameY);
    const primaryPixel = getPixel(image, x, primaryY);
    const secondaryPixel = getPixel(image, x, secondaryY);
    frameRed += framePixel[0];
    frameGreen += framePixel[1];
    frameBlue += framePixel[2];
    primaryRed += primaryPixel[0];
    primaryGreen += primaryPixel[1];
    primaryBlue += primaryPixel[2];
    secondaryRed += secondaryPixel[0];
    secondaryGreen += secondaryPixel[1];
    secondaryBlue += secondaryPixel[2];
    count += 1;
  }
  const frameColor = [
    Math.round(frameRed / Math.max(1, count)),
    Math.round(frameGreen / Math.max(1, count)),
    Math.round(frameBlue / Math.max(1, count)),
  ] as Rgb;
  const primaryColor = [
    Math.round(primaryRed / Math.max(1, count)),
    Math.round(primaryGreen / Math.max(1, count)),
    Math.round(primaryBlue / Math.max(1, count)),
  ] as Rgb;
  const secondaryColor = [
    Math.round(secondaryRed / Math.max(1, count)),
    Math.round(secondaryGreen / Math.max(1, count)),
    Math.round(secondaryBlue / Math.max(1, count)),
  ] as Rgb;
  return Math.max(
    rgbDistance(frameColor, primaryColor),
    rgbDistance(frameColor, secondaryColor),
  );
}

function isBoardFrameLinePixel(pixel: Rgb) {
  return isChartFramePixel(pixel) || isLightSeparatorPixel(pixel) || isFrameAccentPixel(pixel);
}

function isFrameAccentPixel(pixel: Rgb) {
  const [red, green, blue] = pixel;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  return luminance >= 96 && luminance <= 238 && chroma >= 18;
}

function findHorizontalFrameEdgeCandidates(
  image: RasterImage,
  startY: number,
  endY: number,
  side: "top" | "bottom",
) {
  const candidates: Array<FrameEdgeCandidate & { score: number }> = [];
  for (let y = startY; y <= endY; y += 1) {
    const colorSample = sampleHorizontalFrameEdgeColor(image, 0, image.width - 1, y);
    if (colorSample.dominance < 0.16) {
      continue;
    }
    const coverage = measureHorizontalFrameCoverage(image, 0, image.width - 1, y, colorSample.color);
    const insideOffset = side === "top" ? Math.min(4, image.height - 1 - y) : -Math.min(4, y);
    const contrast = measureHorizontalFrameContrast(image, 0, image.width - 1, y, insideOffset);
    if (coverage < 0.18 || contrast < 10) {
      continue;
    }
    const edgeDistance =
      side === "top"
        ? y / Math.max(1, image.height)
        : (image.height - 1 - y) / Math.max(1, image.height);
    const score = coverage * 2.2 + contrast * 0.04 + colorSample.dominance * 1.3 - edgeDistance * 0.8;
    candidates.push({
      position: y,
      coverage,
      contrast,
      dominantColor: colorSample.color,
      dominance: colorSample.dominance,
      score,
    });
  }

  return dedupeFrameEdgeCandidates(candidates, side).slice(0, 6);
}

function findVerticalFrameEdgeCandidates(
  image: RasterImage,
  startX: number,
  endX: number,
  side: "left" | "right",
) {
  const candidates: Array<FrameEdgeCandidate & { score: number }> = [];
  for (let x = startX; x <= endX; x += 1) {
    const colorSample = sampleVerticalFrameEdgeColor(image, 0, image.height - 1, x);
    if (colorSample.dominance < 0.16) {
      continue;
    }
    const coverage = measureVerticalFrameCoverage(image, 0, image.height - 1, x, colorSample.color);
    const insideOffset = side === "left" ? Math.min(4, image.width - 1 - x) : -Math.min(4, x);
    const contrast = measureVerticalFrameContrast(image, 0, image.height - 1, x, insideOffset);
    if (coverage < 0.18 || contrast < 10) {
      continue;
    }
    const edgeDistance =
      side === "left"
        ? x / Math.max(1, image.width)
        : (image.width - 1 - x) / Math.max(1, image.width);
    const score = coverage * 2.2 + contrast * 0.04 + colorSample.dominance * 1.3 - edgeDistance * 0.8;
    candidates.push({
      position: x,
      coverage,
      contrast,
      dominantColor: colorSample.color,
      dominance: colorSample.dominance,
      score,
    });
  }

  return dedupeFrameEdgeCandidates(candidates, side).slice(0, 6);
}

function dedupeFrameEdgeCandidates(
  candidates: Array<FrameEdgeCandidate & { score: number }>,
  side: "top" | "bottom" | "left" | "right",
) {
  if (candidates.length === 0) {
    return [];
  }

  candidates.sort((left, right) =>
    side === "top" || side === "left"
      ? left.position - right.position
      : right.position - left.position,
  );

  const merged: Array<FrameEdgeCandidate & { score: number }> = [];
  for (const candidate of candidates) {
    const last = merged.at(-1);
    if (!last || Math.abs(candidate.position - last.position) > 3) {
      merged.push(candidate);
      continue;
    }
    if (candidate.score > last.score) {
      merged[merged.length - 1] = candidate;
    }
  }

  const byEdge = [...merged].sort((left, right) =>
    side === "top" || side === "left"
      ? left.position - right.position
      : right.position - left.position,
  );
  const byScore = [...merged].sort((left, right) => right.score - left.score);
  const selected = new Map<number, FrameEdgeCandidate & { score: number }>();

  for (const candidate of byEdge.slice(0, 4)) {
    selected.set(candidate.position, candidate);
  }
  for (const candidate of byScore.slice(0, 6)) {
    selected.set(candidate.position, candidate);
  }

  const strongest = Array.from(selected.values());
  strongest.sort((left, right) =>
    side === "top" || side === "left"
      ? left.position - right.position
      : right.position - left.position,
  );
  return strongest;
}

type FrameEdgeCandidate = {
  position: number;
  coverage: number;
  contrast: number;
  dominantColor: Rgb;
  dominance: number;
};

function hasConsistentFrameEdgeColors(edges: FrameEdgeCandidate[]) {
  if (edges.some((edge) => edge.dominance < 0.24)) {
    return false;
  }

  for (let index = 0; index < edges.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < edges.length; compareIndex += 1) {
      if (rgbDistance(edges[index].dominantColor, edges[compareIndex].dominantColor) > 64) {
        return false;
      }
    }
  }

  return true;
}

function sampleHorizontalFrameEdgeColor(
  image: RasterImage,
  left: number,
  right: number,
  y: number,
) {
  return sampleDominantEdgeColor((x) => getPixel(image, x, y), right - left + 1, left);
}

function sampleVerticalFrameEdgeColor(
  image: RasterImage,
  top: number,
  bottom: number,
  x: number,
) {
  return sampleDominantEdgeColor((y) => getPixel(image, x, y), bottom - top + 1, top);
}

function sampleDominantEdgeColor(
  getPixelAt: (index: number) => Rgb,
  length: number,
  offset: number,
) {
  const buckets = new Map<string, { count: number; red: number; green: number; blue: number }>();
  let total = 0;

  for (let index = 0; index < length; index += 1) {
    const pixel = getPixelAt(offset + index);
    if (!isPotentialFrameSamplePixel(pixel)) {
      continue;
    }
    total += 1;
    const key = quantizeRgbKey(pixel);
    const entry = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    entry.count += 1;
    entry.red += pixel[0];
    entry.green += pixel[1];
    entry.blue += pixel[2];
    buckets.set(key, entry);
  }

  if (total <= 0 || buckets.size <= 0) {
    return {
      color: [0, 0, 0] as Rgb,
      dominance: 0,
    };
  }

  let best: { count: number; red: number; green: number; blue: number } | null = null;
  for (const entry of buckets.values()) {
    if (!best || entry.count > best.count) {
      best = entry;
    }
  }

  if (!best) {
    return {
      color: [0, 0, 0] as Rgb,
      dominance: 0,
    };
  }

  return {
    color: [
      Math.round(best.red / Math.max(1, best.count)),
      Math.round(best.green / Math.max(1, best.count)),
      Math.round(best.blue / Math.max(1, best.count)),
    ] as Rgb,
    dominance: best.count / total,
  };
}

function isPotentialFrameSamplePixel(pixel: Rgb) {
  const [red, green, blue] = pixel;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  return luminance <= 248 || chroma >= 8;
}

function quantizeRgbKey(pixel: Rgb) {
  const step = 24;
  return pixel
    .map((channel) => Math.round(channel / step) * step)
    .join(",");
}

function rgbDistance(left: Rgb, right: Rgb) {
  const deltaRed = left[0] - right[0];
  const deltaGreen = left[1] - right[1];
  const deltaBlue = left[2] - right[2];
  return Math.sqrt(deltaRed * deltaRed + deltaGreen * deltaGreen + deltaBlue * deltaBlue);
}

function measureVerticalFrameContrast(
  image: RasterImage,
  top: number,
  bottom: number,
  frameX: number,
  insideOffset: number,
) {
  const primaryX = Math.max(0, Math.min(image.width - 1, frameX + insideOffset));
  const reverseDelta = insideOffset >= 0 ? -1 : 1;
  const secondaryX = Math.max(0, Math.min(image.width - 1, frameX + reverseDelta));
  let frameRed = 0;
  let frameGreen = 0;
  let frameBlue = 0;
  let primaryRed = 0;
  let primaryGreen = 0;
  let primaryBlue = 0;
  let secondaryRed = 0;
  let secondaryGreen = 0;
  let secondaryBlue = 0;
  let count = 0;
  for (let y = top; y <= bottom; y += 1) {
    const framePixel = getPixel(image, frameX, y);
    const primaryPixel = getPixel(image, primaryX, y);
    const secondaryPixel = getPixel(image, secondaryX, y);
    frameRed += framePixel[0];
    frameGreen += framePixel[1];
    frameBlue += framePixel[2];
    primaryRed += primaryPixel[0];
    primaryGreen += primaryPixel[1];
    primaryBlue += primaryPixel[2];
    secondaryRed += secondaryPixel[0];
    secondaryGreen += secondaryPixel[1];
    secondaryBlue += secondaryPixel[2];
    count += 1;
  }
  const frameColor = [
    Math.round(frameRed / Math.max(1, count)),
    Math.round(frameGreen / Math.max(1, count)),
    Math.round(frameBlue / Math.max(1, count)),
  ] as Rgb;
  const primaryColor = [
    Math.round(primaryRed / Math.max(1, count)),
    Math.round(primaryGreen / Math.max(1, count)),
    Math.round(primaryBlue / Math.max(1, count)),
  ] as Rgb;
  const secondaryColor = [
    Math.round(secondaryRed / Math.max(1, count)),
    Math.round(secondaryGreen / Math.max(1, count)),
    Math.round(secondaryBlue / Math.max(1, count)),
  ] as Rgb;
  return Math.max(
    rgbDistance(frameColor, primaryColor),
    rgbDistance(frameColor, secondaryColor),
  );
}

function detectLegendBoardFromAxisLabels(image: RasterImage): DetectionResult | null {
  const xAxis = detectChartAxisLabelFamily(image, "x");
  const yAxis = detectChartAxisLabelFamily(image, "y");
  if (!xAxis || !yAxis) {
    return null;
  }

  const halfX = xAxis.period / 2;
  const halfY = yAxis.period / 2;
  const cropBox: CropBox = [
    Math.max(0, Math.round(xAxis.firstLine - halfX)),
    Math.max(0, Math.round(yAxis.firstLine - halfY)),
    Math.min(image.width, Math.round(xAxis.lastLine + halfX + 1)),
    Math.min(image.height, Math.round(yAxis.lastLine + halfY + 1)),
  ];
  const cropWidth = cropBox[2] - cropBox[0];
  const cropHeight = cropBox[3] - cropBox[1];
  if (cropWidth <= 0 || cropHeight <= 0) {
    return null;
  }

  const gridWidth = xAxis.sequenceCount;
  const gridHeight = yAxis.sequenceCount;
  if (!isReasonableGrid(gridWidth, gridHeight)) {
    return null;
  }

  return {
    gridWidth,
    gridHeight,
    cropBox,
    mode: "detected-axis-label-grid",
  };
}

function detectAxisLabelBoardInnerCrop(image: RasterImage): CropBox | null {
  const xBounds = detectStrongDarkLineBounds(
    buildRestrictedDarkCoverageSignal(image, "x", 0.08, 0.92),
    image.width,
  );
  const yBounds = detectStrongDarkLineBounds(
    buildRestrictedDarkCoverageSignal(image, "y", 0.08, 0.92),
    image.height,
  );
  if (!xBounds || !yBounds) {
    return null;
  }

  const cropBox: CropBox = [
    Math.max(0, xBounds[0] + 1),
    Math.max(0, yBounds[0] + 1),
    Math.min(image.width, xBounds[1]),
    Math.min(image.height, yBounds[1]),
  ];
  const cropWidth = cropBox[2] - cropBox[0];
  const cropHeight = cropBox[3] - cropBox[1];
  if (
    cropWidth < image.width * 0.72 ||
    cropHeight < image.height * 0.66
  ) {
    return null;
  }

  return cropBox;
}

function detectLegendBoardCoreCrop(image: RasterImage): CropBox | null {
  const xRange = detectCoreCoverageRange(buildLightSeparatorCoverageSignal(image, "x"));
  const yRange = detectCoreCoverageRange(buildLightSeparatorCoverageSignal(image, "y"));
  if (!xRange || !yRange) {
    return null;
  }

  const cropBox: CropBox = [xRange[0], yRange[0], xRange[1], yRange[1]];
  const cropWidth = cropBox[2] - cropBox[0];
  const cropHeight = cropBox[3] - cropBox[1];
  if (
    cropWidth < image.width * 0.72 ||
    cropHeight < image.height * 0.62
  ) {
    return null;
  }

  return cropBox;
}

function detectChartAxisLabelFamily(image: RasterImage, axis: "x" | "y"): AxisGrid | null {
  const minPeriod = 18;
  const signals = axis === "x"
    ? buildHorizontalLabelBandSignals(image)
    : buildVerticalLabelBandSignals(image);
  const candidates = signals.flatMap((signal) => [
    detectPeriodFromSignal(signal, minPeriod),
    detectLooseParallelLineFamilyFromSignal(signal, minPeriod),
    buildAxisGridFromSignalGlobalFamily(signal, minPeriod),
  ]).filter((value): value is AxisGrid => Boolean(value));

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => {
    if (right.sequenceCount !== left.sequenceCount) {
      return right.sequenceCount - left.sequenceCount;
    }
    const leftSpan = left.lastLine - left.firstLine;
    const rightSpan = right.lastLine - right.firstLine;
    if (rightSpan !== leftSpan) {
      return rightSpan - leftSpan;
    }
    return right.period - left.period;
  });
  return candidates[0];
}

function buildHorizontalLabelBandSignal(image: RasterImage) {
  const bandHeight = Math.min(Math.max(16, Math.round(image.height * 0.075)), 72);
  const bands: Array<[number, number]> = [
    [Math.max(0, image.height - bandHeight), image.height],
    [0, Math.min(image.height, bandHeight)],
  ];
  return buildCombinedLabelSignal(image, "x", bands);
}

function buildHorizontalLabelBandSignals(image: RasterImage) {
  const bandHeight = Math.min(Math.max(16, Math.round(image.height * 0.075)), 72);
  const topBand: [number, number] = [0, Math.min(image.height, bandHeight)];
  const bottomBand: [number, number] = [Math.max(0, image.height - bandHeight), image.height];
  return [
    buildCombinedLabelSignal(image, "x", [topBand]),
    buildCombinedLabelSignal(image, "x", [bottomBand]),
    buildCombinedLabelSignal(image, "x", [bottomBand, topBand]),
  ];
}

function buildVerticalLabelBandSignal(image: RasterImage) {
  const bandWidth = Math.min(Math.max(16, Math.round(image.width * 0.055)), 64);
  const bands: Array<[number, number]> = [
    [0, Math.min(image.width, bandWidth)],
    [Math.max(0, image.width - bandWidth), image.width],
  ];
  return buildCombinedLabelSignal(image, "y", bands);
}

function buildVerticalLabelBandSignals(image: RasterImage) {
  const bandWidth = Math.min(Math.max(16, Math.round(image.width * 0.055)), 64);
  const leftBand: [number, number] = [0, Math.min(image.width, bandWidth)];
  const rightBand: [number, number] = [Math.max(0, image.width - bandWidth), image.width];
  return [
    buildCombinedLabelSignal(image, "y", [leftBand]),
    buildCombinedLabelSignal(image, "y", [rightBand]),
    buildCombinedLabelSignal(image, "y", [leftBand, rightBand]),
  ];
}

function buildCombinedLabelSignal(
  image: RasterImage,
  axis: "x" | "y",
  bands: Array<[number, number]>,
) {
  const axisLength = axis === "x" ? image.width : image.height;
  const signal = new Float32Array(axisLength);

  for (const [bandStart, bandEnd] of bands) {
    for (let line = 0; line < axisLength; line += 1) {
      let matches = 0;
      for (let offset = bandStart; offset < bandEnd; offset += 1) {
        const pixel = axis === "x" ? getPixel(image, line, offset) : getPixel(image, offset, line);
        if (isChartFramePixel(pixel)) {
          matches += 1;
        }
      }
      signal[line] += matches / Math.max(1, bandEnd - bandStart);
    }
  }

  return smoothSignal(signal);
}

function detectLegendBoardInnerCrop(image: RasterImage): CropBox | null {
  const xRange = detectDenseSeparatorRange(buildLightSeparatorCoverageSignal(image, "x"));
  const yRange = detectDenseSeparatorRange(buildLightSeparatorCoverageSignal(image, "y"));
  if (!xRange && !yRange) {
    return null;
  }

  const cropBox: CropBox = [
    xRange?.[0] ?? 0,
    yRange?.[0] ?? 0,
    xRange?.[1] ?? image.width,
    yRange?.[1] ?? image.height,
  ];
  const cropWidth = cropBox[2] - cropBox[0];
  const cropHeight = cropBox[3] - cropBox[1];
  if (
    cropWidth < image.width * 0.58 ||
    cropHeight < image.height * 0.52
  ) {
    return null;
  }

  return cropBox;
}

function buildDarkCoverageSignal(image: RasterImage, axis: "x" | "y") {
  const axisLength = axis === "x" ? image.width : image.height;
  const otherLength = axis === "x" ? image.height : image.width;
  const signal = new Float32Array(axisLength);

  for (let line = 0; line < axisLength; line += 1) {
    let matches = 0;
    for (let offset = 0; offset < otherLength; offset += 1) {
      const pixel = axis === "x" ? getPixel(image, line, offset) : getPixel(image, offset, line);
      if (isChartFramePixel(pixel)) {
        matches += 1;
      }
    }
    signal[line] = matches / Math.max(1, otherLength);
  }

  return smoothSignal(signal);
}

function buildRestrictedDarkCoverageSignal(
  image: RasterImage,
  axis: "x" | "y",
  startRatio: number,
  endRatio: number,
) {
  const axisLength = axis === "x" ? image.width : image.height;
  const otherLength = axis === "x" ? image.height : image.width;
  const otherStart = Math.max(0, Math.floor(otherLength * startRatio));
  const otherEnd = Math.min(otherLength, Math.ceil(otherLength * endRatio));
  const signal = new Float32Array(axisLength);

  for (let line = 0; line < axisLength; line += 1) {
    let matches = 0;
    for (let offset = otherStart; offset < otherEnd; offset += 1) {
      const pixel = axis === "x" ? getPixel(image, line, offset) : getPixel(image, offset, line);
      if (isVeryDarkNeutralPixel(pixel)) {
        matches += 1;
      }
    }
    signal[line] = matches / Math.max(1, otherEnd - otherStart);
  }

  return smoothSignal(signal);
}

function detectCoreCoverageRange(signal: Float32Array): [number, number] | null {
  if (signal.length < 24) {
    return null;
  }

  const mean = arrayMean(signal);
  const stddev = arrayStandardDeviation(signal, mean);
  const maxValue = Math.max(...signal);
  const threshold = Math.max(maxValue * 0.52, mean + stddev * 1.15, mean + 0.01);
  const hits: number[] = [];
  for (let index = 0; index < signal.length; index += 1) {
    if (signal[index] >= threshold) {
      hits.push(index);
    }
  }

  if (hits.length < 16) {
    return null;
  }

  let bestStart = hits[0];
  let bestEnd = hits[0];
  let currentStart = hits[0];
  let currentEnd = hits[0];
  let bestLength = 1;
  let currentLength = 1;
  const maxGap = Math.max(4, Math.round(signal.length * 0.006));

  for (let index = 1; index < hits.length; index += 1) {
    const value = hits[index];
    if (value - currentEnd <= maxGap) {
      currentEnd = value;
      currentLength += 1;
      continue;
    }

    if (currentLength > bestLength || (currentLength === bestLength && currentEnd - currentStart > bestEnd - bestStart)) {
      bestStart = currentStart;
      bestEnd = currentEnd;
      bestLength = currentLength;
    }
    currentStart = value;
    currentEnd = value;
    currentLength = 1;
  }

  if (currentLength > bestLength || (currentLength === bestLength && currentEnd - currentStart > bestEnd - bestStart)) {
    bestStart = currentStart;
    bestEnd = currentEnd;
    bestLength = currentLength;
  }

  if (bestEnd - bestStart < signal.length * 0.48) {
    return null;
  }

  const padding = 2;
  return [Math.max(0, bestStart - padding), Math.min(signal.length, bestEnd + padding + 1)];
}

function detectStrongDarkLineBounds(signal: Float32Array, axisLength: number): [number, number] | null {
  if (signal.length < 24) {
    return null;
  }

  const mean = arrayMean(signal);
  const stddev = arrayStandardDeviation(signal, mean);
  const maxValue = Math.max(...signal);
  const threshold = Math.max(mean + stddev * 1.8, maxValue * 0.42, 0.035);
  const peaks = localMaxima(signal, threshold);
  if (peaks.length < 2) {
    return null;
  }

  const startCandidates = peaks.filter((peak) => peak <= axisLength * 0.38);
  const endCandidates = peaks.filter((peak) => peak >= axisLength * 0.62);
  if (!startCandidates.length || !endCandidates.length) {
    return null;
  }

  let bestPair: [number, number] | null = null;
  let bestScore = -Infinity;
  for (const left of startCandidates) {
    for (const right of endCandidates) {
      if (right <= left) {
        continue;
      }
      const span = right - left;
      if (span < axisLength * 0.62) {
        continue;
      }

      const edgeScore =
        (1 - left / Math.max(1, axisLength)) +
        (right / Math.max(1, axisLength));
      const score = span / Math.max(1, axisLength) + edgeScore * 0.18 + signal[left] + signal[right];
      if (score > bestScore) {
        bestPair = [left, right];
        bestScore = score;
      }
    }
  }

  return bestPair;
}

function detectPeriodicLegendBoard(image: RasterImage): DetectionResult | null {
  const xAxis = detectChartAxisGridFromSignals(image, "x");
  const yAxis = detectChartAxisGridFromSignals(image, "y");
  if (!xAxis || !yAxis) {
    return null;
  }

  const cropBox: CropBox = [
    Math.max(0, xAxis.firstLine - 1),
    Math.max(0, yAxis.firstLine - 1),
    Math.min(image.width, xAxis.lastLine + 2),
    Math.min(image.height, yAxis.lastLine + 2),
  ];
  const cropWidth = cropBox[2] - cropBox[0];
  const cropHeight = cropBox[3] - cropBox[1];
  const gridWidth = Math.round(cropWidth / Math.max(1, xAxis.period));
  const gridHeight = Math.round(cropHeight / Math.max(1, yAxis.period));
  if (!isReasonableGrid(gridWidth, gridHeight)) {
    return null;
  }

  const cellWidth = cropWidth / Math.max(1, gridWidth);
  const cellHeight = cropHeight / Math.max(1, gridHeight);
  if (cellWidth < 6 || cellHeight < 6) {
    return null;
  }

  return {
    gridWidth,
    gridHeight,
    cropBox,
    mode: "detected-periodic-chart-grid",
  };
}

function detectChartAxisGridFromSignals(image: RasterImage, axis: "x" | "y"): AxisGrid | null {
  const minPeriod = 24;
  const signals = [
    buildLightSeparatorCoverageSignal(image, axis),
    buildRestrictedHoughVoteSignal(image, axis, 0.04, 0.96),
    smoothSignal(buildEdgeSignal(image, axis)),
  ];
  const candidates = signals.flatMap((signal) => {
    const values = [
      detectPeriodFromSignal(signal, minPeriod),
      detectLooseParallelLineFamilyFromSignal(signal, minPeriod),
      detectParallelLineFamilyFromSignal(signal, minPeriod),
      buildAxisGridFromSignalGlobalFamily(signal, minPeriod),
    ];
    return values.filter((value): value is AxisGrid => Boolean(value));
  });

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => {
    const leftSpan = left.lastLine - left.firstLine;
    const rightSpan = right.lastLine - right.firstLine;
    if (rightSpan !== leftSpan) {
      return rightSpan - leftSpan;
    }
    if (right.sequenceCount !== left.sequenceCount) {
      return right.sequenceCount - left.sequenceCount;
    }
    return right.period - left.period;
  });
  return candidates[0];
}

function detectLooseParallelLineFamilyFromSignal(
  signal: Float32Array,
  minPeriod: number,
): AxisGrid | null {
  if (signal.length < minPeriod * 4) {
    return null;
  }

  const smoothed = smoothSignal(signal);
  const mean = arrayMean(smoothed);
  const maxValue = Math.max(...smoothed);
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return null;
  }

  const dominantPeriod = dominantAutocorrelationPeriod(smoothed, minPeriod);
  if (!dominantPeriod) {
    return null;
  }

  let best: AxisGrid | null = null;
  for (const period of [dominantPeriod - 1, dominantPeriod, dominantPeriod + 1]) {
    if (period < minPeriod) {
      continue;
    }

    const phaseSums = new Float32Array(period);
    const phaseCounts = new Int32Array(period);
    for (let index = 0; index < smoothed.length; index += 1) {
      const phase = index % period;
      phaseSums[phase] += smoothed[index];
      phaseCounts[phase] += 1;
    }

    let bestPhase = 0;
    let bestPhaseAverage = -1;
    for (let phase = 0; phase < period; phase += 1) {
      const average = phaseSums[phase] / Math.max(1, phaseCounts[phase]);
      if (average > bestPhaseAverage) {
        bestPhaseAverage = average;
        bestPhase = phase;
      }
    }

    const tolerance = Math.max(3, Math.round(period * 0.32));
    const minimumLineSignal = Math.max(mean * 0.92, bestPhaseAverage * 0.26);
    const positions: number[] = [];
    for (let expected = bestPhase; expected < smoothed.length; expected += period) {
      const snapped = findBestSignalNear(smoothed, expected, tolerance, minimumLineSignal);
      if (snapped !== null) {
        positions.push(snapped);
      }
    }

    const family = compressLinePositions(positions, tolerance);
    if (family.length < Math.max(10, DEFAULT_MIN_GRID_CELLS * 3)) {
      continue;
    }

    const firstLine = family[0];
    const lastLine = family[family.length - 1];
    const span = lastLine - firstLine;
    if (span < smoothed.length * 0.52) {
      continue;
    }

    const candidate: AxisGrid = {
      period,
      firstLine,
      lastLine,
      sequenceCount: family.length,
    };

    if (
      !best ||
      candidate.sequenceCount > best.sequenceCount ||
      (candidate.sequenceCount === best.sequenceCount &&
        candidate.lastLine - candidate.firstLine > best.lastLine - best.firstLine)
    ) {
      best = candidate;
    }
  }

  return best;
}

function isPlausibleLegendBoardDetection(image: RasterImage, detection: DetectionResult) {
  const cropWidth = detection.cropBox[2] - detection.cropBox[0];
  const cropHeight = detection.cropBox[3] - detection.cropBox[1];
  if (cropWidth <= 0 || cropHeight <= 0) {
    return false;
  }

  const areaRatio = (cropWidth * cropHeight) / Math.max(1, image.width * image.height);
  const cellWidth = cropWidth / Math.max(1, detection.gridWidth);
  const cellHeight = cropHeight / Math.max(1, detection.gridHeight);
  const cellAspect = Math.max(cellWidth, cellHeight) / Math.max(1e-6, Math.min(cellWidth, cellHeight));

  return (
    detection.gridWidth >= 16 &&
    detection.gridHeight >= 16 &&
    areaRatio >= 0.34 &&
    cellWidth >= 6 &&
    cellHeight >= 6 &&
    cellAspect <= 1.45
  );
}

function buildAxisGridFromSignalGlobalFamily(signal: Float32Array, minPeriod: number): AxisGrid | null {
  if (signal.length < minPeriod * 4) {
    return null;
  }

  const smoothed = smoothSignal(signal);
  const mean = arrayMean(smoothed);
  const stddev = arrayStandardDeviation(smoothed, mean);
  let maxValue = 0;
  for (const value of smoothed) {
    if (value > maxValue) {
      maxValue = value;
    }
  }

  const threshold = Math.max(mean + stddev * 0.45, maxValue * 0.24, mean + 1);
  const peaks = localMaxima(smoothed, threshold);
  if (peaks.length < 8) {
    return null;
  }

  const diffs: number[] = [];
  for (let index = 0; index < peaks.length - 1; index += 1) {
    const diff = peaks[index + 1] - peaks[index];
    if (diff >= minPeriod && diff <= Math.min(128, Math.floor(signal.length / 2))) {
      diffs.push(diff);
    }
  }

  const candidatePeriods = new Set<number>();
  const periodByDiffs = dominantPeriod(diffs, minPeriod);
  const periodByAutocorrelation = dominantAutocorrelationPeriod(smoothed, minPeriod);
  for (const period of [periodByDiffs, periodByAutocorrelation]) {
    if (!period) {
      continue;
    }
    candidatePeriods.add(period);
    if (period > minPeriod * 2) {
      candidatePeriods.add(Math.max(minPeriod, Math.round(period / 2)));
    }
    candidatePeriods.add(period + 1);
    candidatePeriods.add(Math.max(minPeriod, period - 1));
  }

  let best: (AxisGrid & { span: number; error: number }) | null = null;
  for (const period of candidatePeriods) {
    if (!Number.isFinite(period) || period < minPeriod) {
      continue;
    }
    const tolerance = Math.max(2, Math.round(period * 0.18));
    for (const anchor of peaks) {
      const family = collectPeakFamily(peaks, anchor, period, tolerance);
      if (family.length < 8) {
        continue;
      }

      const firstLine = family[0];
      const lastLine = family[family.length - 1];
      const span = lastLine - firstLine;
      if (span < signal.length * 0.45) {
        continue;
      }

      let error = 0;
      for (let index = 0; index < family.length - 1; index += 1) {
        error += Math.abs((family[index + 1] - family[index]) - period);
      }
      error /= Math.max(1, family.length - 1);

      if (error > tolerance * 0.8) {
        continue;
      }

      const candidate = {
        period,
        firstLine,
        lastLine,
        sequenceCount: family.length,
        span,
        error,
      };

      if (
        !best ||
        candidate.span > best.span ||
        (candidate.span === best.span && candidate.sequenceCount > best.sequenceCount) ||
        (candidate.span === best.span &&
          candidate.sequenceCount === best.sequenceCount &&
          candidate.error < best.error)
      ) {
        best = candidate;
      }
    }
  }

  if (!best) {
    return null;
  }

  return {
    period: best.period,
    firstLine: best.firstLine,
    lastLine: best.lastLine,
    sequenceCount: best.sequenceCount,
  };
}

function collectPeakFamily(
  peaks: number[],
  anchor: number,
  period: number,
  tolerance: number,
) {
  const values = new Set<number>([anchor]);
  let expected = anchor - period;
  while (expected >= 0) {
    const nearest = findNearestPeak(peaks, expected, tolerance);
    if (nearest === null) {
      expected -= period;
      continue;
    }
    values.add(nearest);
    expected = nearest - period;
  }

  expected = anchor + period;
  const maxPeak = peaks[peaks.length - 1] ?? anchor;
  while (expected <= maxPeak + tolerance) {
    const nearest = findNearestPeak(peaks, expected, tolerance);
    if (nearest === null) {
      expected += period;
      continue;
    }
    values.add(nearest);
    expected = nearest + period;
  }

  return Array.from(values).sort((left, right) => left - right);
}

function findNearestPeak(peaks: number[], target: number, tolerance: number) {
  let best: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const peak of peaks) {
    const distance = Math.abs(peak - target);
    if (distance > tolerance || distance >= bestDistance) {
      continue;
    }
    best = peak;
    bestDistance = distance;
  }
  return best;
}

function detectDenseLooseContentBandBox(image: RasterImage): CropBox | null {
  const rowCounts = new Int32Array(image.height);
  const columnCounts = new Int32Array(image.width);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (!isLooseContentPixel(getPixel(image, x, y))) {
        continue;
      }
      rowCounts[y] += 1;
      columnCounts[x] += 1;
    }
  }

  const rowRange = detectDenseCountRange(rowCounts, Math.max(18, Math.round(image.width * 0.05)));
  const columnRange = detectDenseCountRange(columnCounts, Math.max(18, Math.round(image.height * 0.08)));
  if (!rowRange || !columnRange) {
    return null;
  }

  const cropBox: CropBox = [columnRange[0], rowRange[0], columnRange[1], rowRange[1]];
  const cropWidth = cropBox[2] - cropBox[0];
  const cropHeight = cropBox[3] - cropBox[1];
  if (
    cropWidth < image.width * 0.42 ||
    cropHeight < image.height * 0.34
  ) {
    return null;
  }

  return cropBox;
}

function detectLargestLooseContentComponentBox(image: RasterImage): CropBox | null {
  const mask = new Uint8Array(image.width * image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (isLooseContentPixel(getPixel(image, x, y))) {
        mask[y * image.width + x] = 1;
      }
    }
  }

  const visited = new Uint8Array(mask.length);
  let best: { box: CropBox; pixelCount: number; area: number } | null = null;

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) {
      continue;
    }

    const component = collectDarkComponent(mask, visited, image.width, image.height, index);
    const left = component.minX;
    const top = component.minY;
    const right = component.maxX + 1;
    const bottom = component.maxY + 1;
    const width = right - left;
    const height = bottom - top;
    const area = width * height;

    if (
      width < image.width * 0.42 ||
      height < image.height * 0.34 ||
      component.pixelCount < Math.max(600, area * 0.035)
    ) {
      continue;
    }

    if (
      !best ||
      area > best.area ||
      (area === best.area && component.pixelCount > best.pixelCount)
    ) {
      best = {
        box: [left, top, right, bottom],
        pixelCount: component.pixelCount,
        area,
      };
    }
  }

  return best?.box ?? null;
}

function detectLightSeparatorBoardBox(image: RasterImage): CropBox | null {
  const xSignal = buildLightSeparatorCoverageSignal(image, "x");
  const ySignal = buildLightSeparatorCoverageSignal(image, "y");
  const xRange = detectSeparatorFamilyExtent(xSignal);
  const yRange = detectSeparatorFamilyExtent(ySignal);

  if (!xRange || !yRange) {
    return null;
  }

  const cropBox: CropBox = [xRange[0], yRange[0], xRange[1], yRange[1]];
  const cropWidth = cropBox[2] - cropBox[0];
  const cropHeight = cropBox[3] - cropBox[1];
  if (
    cropWidth < image.width * 0.45 ||
    cropHeight < image.height * 0.42
  ) {
    return null;
  }

  return cropBox;
}

function detectSeparatorFamilyExtent(signal: Float32Array): [number, number] | null {
  if (signal.length < 12) {
    return null;
  }

  const mean = arrayMean(signal);
  const stddev = arrayStandardDeviation(signal, mean);
  let maxValue = 0;
  for (const value of signal) {
    if (value > maxValue) {
      maxValue = value;
    }
  }

  const threshold = Math.max(0.008, maxValue * 0.12, mean + stddev * 0.45);
  const hits: number[] = [];
  for (let index = 0; index < signal.length; index += 1) {
    if (signal[index] >= threshold) {
      hits.push(index);
    }
  }

  if (hits.length < 18) {
    return null;
  }

  const start = hits[Math.max(0, Math.floor(hits.length * 0.03))] ?? hits[0];
  const end = hits[Math.min(hits.length - 1, Math.ceil(hits.length * 0.97))] ?? hits[hits.length - 1];
  if (end - start < signal.length * 0.35) {
    return null;
  }

  const padding = 2;
  return [Math.max(0, start - padding), Math.min(signal.length, end + padding + 1)];
}

function detectLegendTop(image: RasterImage) {
  const trailingContentLegendTop = detectTrailingLegendBandTop(image);
  if (trailingContentLegendTop !== null) {
    return trailingContentLegendTop;
  }

  const minLegendHeight = Math.max(40, Math.floor(image.height * 0.04));
  const maxLegendHeight = Math.max(minLegendHeight + 8, Math.floor(image.height * 0.34));
  const searchTop = Math.max(0, Math.floor(image.height * 0.5));
  let bestTop: number | null = null;
  let bestScore = 0;

  for (let legendHeight = minLegendHeight; legendHeight <= maxLegendHeight; legendHeight += 10) {
    for (let top = searchTop; top <= image.height - minLegendHeight; top += 8) {
      const bottom = Math.min(image.height, top + legendHeight);
      const region = cropRaster(image, [0, top, image.width, bottom]);
      if (countLegendSwatches(region) < 2) {
        continue;
      }
      const score = scoreChartLegend(region);
      if (score > bestScore) {
        bestScore = score;
        bestTop = top;
      }
    }
  }

  return bestScore >= 0.18 ? bestTop : null;
}

function detectTrailingLegendBandTop(image: RasterImage) {
  const rowCounts = new Int32Array(image.height);
  const rowThreshold = Math.max(8, Math.round(image.width * 0.03));
  for (let y = 0; y < image.height; y += 1) {
    let count = 0;
    for (let x = 0; x < image.width; x += 1) {
      if (isLooseContentPixel(getPixel(image, x, y))) {
        count += 1;
      }
    }
    rowCounts[y] = count;
  }

  let bottom = lastIndexAtOrAbove(rowCounts, rowThreshold);
  if (bottom === null || bottom < image.height * 0.55) {
    return null;
  }

  let top = bottom;
  let gap = 0;
  const maxGap = Math.max(6, Math.round(image.height * 0.01));
  const minTop = Math.max(0, Math.floor(image.height * 0.45));
  while (top > minTop) {
    const previous = top - 1;
    if (rowCounts[previous] >= rowThreshold) {
      top = previous;
      gap = 0;
      continue;
    }
    gap += 1;
    top = previous;
    if (gap > maxGap) {
      top += gap;
      break;
    }
  }

  const region = cropRaster(image, [0, top, image.width, bottom + 1]);
  if (countLegendSwatches(region) < 2) {
    return null;
  }
  return scoreChartLegend(region) >= 0.14 ? top : null;
}

function detectRawPixelArt(image: RasterImage): DetectionResult | null {
  if (image.width > 256 || image.height > 256) {
    return null;
  }

  const uniqueColors = countUniqueColors(image.data);
  const pixelCount = image.width * image.height;
  if (uniqueColors > Math.min(4096, Math.max(Math.floor(pixelCount / 2), 256))) {
    return null;
  }

  return {
    gridWidth: image.width,
    gridHeight: image.height,
    cropBox: [0, 0, image.width, image.height],
    mode: "raw-pixel-art",
  };
}

function detectGridlinePixelArt(image: RasterImage): DetectionResult | null {
  const xAxis = detectDarkAxisGrid(image, "x");
  const yAxis = detectDarkAxisGrid(image, "y");
  if (!xAxis || !yAxis) {
    return null;
  }

  const leftTrim = Math.max(xAxis.firstLine, 0);
  const topTrim = Math.max(yAxis.firstLine, 0);
  const rightTrim = Math.max(image.width - 1 - xAxis.lastLine, 0);

  const cropWidth = image.width - leftTrim - rightTrim;
  const cropHeight = image.height - topTrim;
  if (cropWidth <= 0 || cropHeight <= 0) {
    return null;
  }

  const gridWidth = Math.round(cropWidth / xAxis.period);
  const gridHeight = Math.round(cropHeight / yAxis.period);
  if (!isReasonableGrid(gridWidth, gridHeight)) {
    return null;
  }

  return {
    gridWidth,
    gridHeight,
    cropBox: [leftTrim, topTrim, image.width - rightTrim, image.height],
    mode: "detected-gridlines",
  };
}

function detectBlockPixelArt(image: RasterImage): DetectionResult | null {
  const xSignal = buildEdgeSignal(image, "x");
  const ySignal = buildEdgeSignal(image, "y");

  const xAxis = detectPeriodFromSignal(xSignal, 2);
  const yAxis = detectPeriodFromSignal(ySignal, 2);
  if (!xAxis || !yAxis) {
    return null;
  }

  const gridWidth = Math.round(image.width / xAxis.period);
  const gridHeight = Math.round(image.height / yAxis.period);
  if (!isReasonableGrid(gridWidth, gridHeight)) {
    return null;
  }

  const logical = sampleRegularGrid(image, gridWidth, gridHeight);
  const reconstructed = scaleLogicalNearest(logical, image.width, image.height);
  const error = meanAbsoluteError(image, reconstructed);
  if (error > 35) {
    return null;
  }

  return {
    gridWidth,
    gridHeight,
    cropBox: [0, 0, image.width, image.height],
    mode: "detected-blocks",
  };
}

function detectGappedGridPixelArt(image: RasterImage): DetectionResult | null {
  const xSegments = detectGappedAxis(image, "x");
  const ySegments = detectGappedAxis(image, "y");
  if (!xSegments || !ySegments) {
    return null;
  }

  const gridWidth = xSegments.length;
  const gridHeight = ySegments.length;
  if (!isReasonableGrid(gridWidth, gridHeight)) {
    return null;
  }

  const cropBox: CropBox = [
    xSegments[0][0],
    ySegments[0][0],
    xSegments[xSegments.length - 1][1],
    ySegments[ySegments.length - 1][1],
  ];
  if (cropBox[2] <= cropBox[0] || cropBox[3] <= cropBox[1]) {
    return null;
  }

  const logical = sampleSegments(image, xSegments, ySegments);
  const reconstructed = reconstructSegments(logical, xSegments, ySegments, cropBox);
  const reference = cropRaster(image, cropBox);
  const error = meanAbsoluteError(reference, reconstructed);
  if (error > 55) {
    return null;
  }

  return {
    gridWidth,
    gridHeight,
    cropBox,
    mode: "detected-gapped-grid",
    xSegments,
    ySegments,
  };
}

function detectDarkAxisGrid(image: RasterImage, axis: "x" | "y"): AxisGrid | null {
  const axisLength = axis === "x" ? image.width : image.height;
  const otherLength = axis === "x" ? image.height : image.width;
  if (axisLength < 4 || otherLength < 4) {
    return null;
  }

  const sampleLength = Math.max(
    Math.min(Math.floor(otherLength * 0.08), otherLength - 1),
    Math.min(8, otherLength - 1),
  );
  const leading = new Float32Array(axisLength);
  const trailing = new Float32Array(axisLength);

  for (let line = 0; line < axisLength; line += 1) {
    let leadSum = 0;
    let trailSum = 0;
    let count = 0;
    for (let offset = 0; offset <= sampleLength; offset += 1) {
      const leadPixel = axis === "x" ? getPixel(image, line, offset) : getPixel(image, offset, line);
      const trailPixel =
        axis === "x"
          ? getPixel(image, line, image.height - 1 - offset)
          : getPixel(image, image.width - 1 - offset, line);
      leadSum += 255 - rgbToGray(leadPixel);
      trailSum += 255 - rgbToGray(trailPixel);
      count += 1;
    }
    leading[line] = leadSum / Math.max(count, 1);
    trailing[line] = trailSum / Math.max(count, 1);
  }

  const combined = new Float32Array(axisLength);
  for (let index = 0; index < axisLength; index += 1) {
    combined[index] = Math.min(leading[index], trailing[index]);
  }

  const candidates = [
    buildAxisGridFromSignal(leading, 8),
    buildAxisGridFromSignal(trailing, 8),
    buildAxisGridFromSignal(combined, 8),
  ].filter((value): value is AxisGrid => Boolean(value));

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => {
    if (right.sequenceCount !== left.sequenceCount) {
      return right.sequenceCount - left.sequenceCount;
    }

    return (right.lastLine - right.firstLine) - (left.lastLine - left.firstLine);
  });
  return candidates[0];
}

function detectLightSeparatorPixelArt(image: RasterImage): DetectionResult | null {
  const xAxis = detectLightAxisGrid(image, "x");
  const yAxis = detectLightAxisGrid(image, "y");
  if (!xAxis || !yAxis) {
    return null;
  }

  const leftTrim = Math.max(xAxis.firstLine, 0);
  const topTrim = Math.max(yAxis.firstLine, 0);
  const rightTrim = Math.max(image.width - 1 - xAxis.lastLine, 0);
  const bottomTrim = Math.max(image.height - 1 - yAxis.lastLine, 0);

  const cropWidth = image.width - leftTrim - rightTrim;
  const cropHeight = image.height - topTrim - bottomTrim;
  if (cropWidth <= 0 || cropHeight <= 0) {
    return null;
  }

  const gridWidth = Math.round(cropWidth / xAxis.period);
  const gridHeight = Math.round(cropHeight / yAxis.period);
  if (!isReasonableGrid(gridWidth, gridHeight)) {
    return null;
  }

  return {
    gridWidth,
    gridHeight,
    cropBox: [leftTrim, topTrim, image.width - rightTrim, image.height - bottomTrim],
    mode: "detected-light-gridlines",
  };
}

function detectOrthogonalHoughAxisGrid(image: RasterImage, axis: "x" | "y"): AxisGrid | null {
  const axisLength = axis === "x" ? image.width : image.height;
  const otherLength = axis === "x" ? image.height : image.width;
  if (axisLength < 24 || otherLength < 24) {
    return null;
  }

  const candidates = [
    detectParallelLineFamilyFromSignal(buildLightSeparatorCoverageSignal(image, axis), 10),
    detectParallelLineFamilyFromSignal(buildRestrictedHoughVoteSignal(image, axis, 0.12, 0.88), 10),
    buildAxisGridFromSignalGlobalFamily(buildRestrictedHoughVoteSignal(image, axis, 0.12, 0.88), 10),
    buildAxisGridFromSignalGlobalFamily(buildLightSeparatorCoverageSignal(image, axis), 10),
  ].filter((value): value is AxisGrid => Boolean(value));

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => {
    const leftSpan = left.lastLine - left.firstLine;
    const rightSpan = right.lastLine - right.firstLine;
    if (rightSpan !== leftSpan) {
      return rightSpan - leftSpan;
    }
    if (right.sequenceCount !== left.sequenceCount) {
      return right.sequenceCount - left.sequenceCount;
    }
    return right.period - left.period;
  });
  return candidates[0];
}

function detectParallelLineFamilyFromSignal(signal: Float32Array, minPeriod: number): AxisGrid | null {
  if (signal.length < minPeriod * 4) {
    return null;
  }

  const smoothed = smoothSignal(signal);
  let maxValue = 0;
  let mean = 0;
  for (const value of smoothed) {
    maxValue = Math.max(maxValue, value);
    mean += value;
  }
  mean /= Math.max(1, smoothed.length);
  if (maxValue <= 0) {
    return null;
  }

  const maxPeriod = Math.min(64, Math.floor(signal.length / 2));
  let best: (AxisGrid & { score: number; averageSignal: number }) | null = null;

  for (let period = minPeriod; period <= maxPeriod; period += 1) {
    const phaseSums = new Float32Array(period);
    const phaseCounts = new Int32Array(period);
    for (let index = 0; index < smoothed.length; index += 1) {
      const phase = index % period;
      phaseSums[phase] += smoothed[index];
      phaseCounts[phase] += 1;
    }

    let bestPhase = 0;
    let bestPhaseAverage = -1;
    for (let phase = 0; phase < period; phase += 1) {
      const average = phaseSums[phase] / Math.max(1, phaseCounts[phase]);
      if (average > bestPhaseAverage) {
        bestPhaseAverage = average;
        bestPhase = phase;
      }
    }

    if (bestPhaseAverage < Math.max(mean * 1.4, maxValue * 0.18)) {
      continue;
    }

    const tolerance = Math.max(2, Math.round(period * 0.24));
    const minimumLineSignal = Math.max(mean * 1.08, bestPhaseAverage * 0.42);
    const positions: number[] = [];
    const start = bestPhase % period;

    for (let expected = start; expected < smoothed.length; expected += period) {
      const snapped = findBestSignalNear(smoothed, expected, tolerance, minimumLineSignal);
      if (snapped !== null) {
        positions.push(snapped);
      }
    }

    const family = compressLinePositions(positions, tolerance);
    if (family.length < 8) {
      continue;
    }

    const firstLine = family[0];
    const lastLine = family[family.length - 1];
    const span = lastLine - firstLine;
    if (span < smoothed.length * 0.48) {
      continue;
    }

    let gapError = 0;
    for (let index = 0; index < family.length - 1; index += 1) {
      gapError += Math.abs((family[index + 1] - family[index]) - period);
    }
    gapError /= Math.max(1, family.length - 1);
    if (gapError > Math.max(2.8, period * 0.22)) {
      continue;
    }

    const score =
      (span / smoothed.length) * 4.2 +
      family.length * 0.18 +
      (bestPhaseAverage / Math.max(1e-6, maxValue)) * 1.6 -
      gapError * 0.08;

    const candidate = {
      period,
      firstLine,
      lastLine,
      sequenceCount: family.length,
      score,
      averageSignal: bestPhaseAverage,
    };

    if (
      !best ||
      candidate.score > best.score ||
      (candidate.score === best.score && candidate.sequenceCount > best.sequenceCount) ||
      (candidate.score === best.score &&
        candidate.sequenceCount === best.sequenceCount &&
        candidate.averageSignal > best.averageSignal)
    ) {
      best = candidate;
    }
  }

  if (!best) {
    return null;
  }

  return {
    period: best.period,
    firstLine: best.firstLine,
    lastLine: best.lastLine,
    sequenceCount: best.sequenceCount,
  };
}

function findBestSignalNear(
  signal: Float32Array,
  expected: number,
  tolerance: number,
  minimumSignal: number,
) {
  const start = Math.max(0, expected - tolerance);
  const end = Math.min(signal.length - 1, expected + tolerance);
  let bestIndex: number | null = null;
  let bestValue = minimumSignal;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = start; index <= end; index += 1) {
    const value = signal[index];
    if (value < minimumSignal) {
      continue;
    }
    const distance = Math.abs(index - expected);
    if (
      value > bestValue ||
      (value === bestValue && distance < bestDistance)
    ) {
      bestIndex = index;
      bestValue = value;
      bestDistance = distance;
    }
  }

  return bestIndex;
}

function compressLinePositions(positions: number[], tolerance: number) {
  if (!positions.length) {
    return [];
  }

  const sorted = [...positions].sort((left, right) => left - right);
  const compressed: number[] = [];
  let clusterStart = sorted[0];
  let clusterSum = sorted[0];
  let clusterCount = 1;

  for (let index = 1; index < sorted.length; index += 1) {
    const value = sorted[index];
    if (value - clusterStart <= tolerance) {
      clusterSum += value;
      clusterCount += 1;
      continue;
    }

    compressed.push(Math.round(clusterSum / clusterCount));
    clusterStart = value;
    clusterSum = value;
    clusterCount = 1;
  }

  compressed.push(Math.round(clusterSum / clusterCount));
  return compressed;
}

function buildRestrictedHoughVoteSignal(
  image: RasterImage,
  axis: "x" | "y",
  startRatio: number,
  endRatio: number,
) {
  if (axis === "x") {
    const signal = new Float32Array(Math.max(0, image.width - 1));
    const startY = Math.max(0, Math.floor(image.height * startRatio));
    const endY = Math.min(image.height, Math.ceil(image.height * endRatio));
    for (let x = 0; x < image.width - 1; x += 1) {
      let sum = 0;
      for (let y = startY; y < endY; y += 1) {
        const left = getPixel(image, x, y);
        const center = getPixel(image, x + 1, y);
        const right = getPixel(image, Math.min(image.width - 1, x + 2), y);
        if (isOrthogonalHoughGridPixel(center)) {
          sum += 2.4;
        }
        sum +=
          ((Math.abs(left[0] - right[0]) +
            Math.abs(left[1] - right[1]) +
            Math.abs(left[2] - right[2])) /
            3) *
          0.02;
      }
      signal[x] = sum / Math.max(1, endY - startY);
    }
    return signal;
  }

  const signal = new Float32Array(Math.max(0, image.height - 1));
  const startX = Math.max(0, Math.floor(image.width * startRatio));
  const endX = Math.min(image.width, Math.ceil(image.width * endRatio));
  for (let y = 0; y < image.height - 1; y += 1) {
    let sum = 0;
    for (let x = startX; x < endX; x += 1) {
      const top = getPixel(image, x, y);
      const center = getPixel(image, x, y + 1);
      const bottom = getPixel(image, x, Math.min(image.height - 1, y + 2));
      if (isOrthogonalHoughGridPixel(center)) {
        sum += 2.4;
      }
      sum +=
        ((Math.abs(top[0] - bottom[0]) +
          Math.abs(top[1] - bottom[1]) +
          Math.abs(top[2] - bottom[2])) /
          3) *
        0.02;
    }
    signal[y] = sum / Math.max(1, endX - startX);
  }
  return signal;
}

function isOrthogonalHoughGridPixel(pixel: Rgb) {
  const [red, green, blue] = pixel;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  return luminance >= 150 && luminance <= 244 && chroma <= 22;
}

function buildLightSeparatorCoverageSignal(image: RasterImage, axis: "x" | "y") {
  const axisLength = axis === "x" ? image.width : image.height;
  const otherLength = axis === "x" ? image.height : image.width;
  const signal = new Float32Array(axisLength);

  for (let line = 0; line < axisLength; line += 1) {
    let matches = 0;
    for (let offset = 0; offset < otherLength; offset += 1) {
      const pixel = axis === "x" ? getPixel(image, line, offset) : getPixel(image, offset, line);
      if (isLightSeparatorPixel(pixel)) {
        matches += 1;
      }
    }
    signal[line] = matches / Math.max(1, otherLength);
  }

  return smoothSignal(signal);
}

function detectDenseSeparatorRange(signal: Float32Array): [number, number] | null {
  if (signal.length < 12) {
    return null;
  }

  const mean = arrayMean(signal);
  const stddev = arrayStandardDeviation(signal, mean);
  let maxValue = 0;
  for (const value of signal) {
    if (value > maxValue) {
      maxValue = value;
    }
  }

  const threshold = Math.max(maxValue * 0.28, mean + stddev * 1.25, 0.018);
  const hits: number[] = [];
  for (let index = 0; index < signal.length; index += 1) {
    if (signal[index] >= threshold) {
      hits.push(index);
    }
  }

  if (hits.length < DEFAULT_MIN_GRID_CELLS * 2) {
    return null;
  }

  const diffs: number[] = [];
  for (let index = 0; index < hits.length - 1; index += 1) {
    const diff = hits[index + 1] - hits[index];
    if (diff >= 1 && diff <= 64) {
      diffs.push(diff);
    }
  }

  diffs.sort((left, right) => left - right);
  const typicalGap = diffs.length
    ? diffs[Math.floor(diffs.length / 2)]
    : Math.max(8, Math.round(signal.length / 40));
  const maxGap = Math.max(6, Math.round(typicalGap * 1.9));
  const minSpan = Math.max(typicalGap * 6, Math.floor(signal.length * 0.16));
  const minHitCount = Math.max(DEFAULT_MIN_GRID_CELLS * 2, 8);
  let bestStart = hits[0];
  let bestEnd = hits[0];
  let bestHitCount = 1;
  let currentStart = hits[0];
  let currentEnd = hits[0];
  let currentHitCount = 1;

  for (let index = 1; index < hits.length; index += 1) {
    const value = hits[index];
    if (value - currentEnd <= maxGap) {
      currentEnd = value;
      currentHitCount += 1;
      continue;
    }

    if (
      currentHitCount > bestHitCount ||
      (currentHitCount === bestHitCount && currentEnd - currentStart > bestEnd - bestStart)
    ) {
      bestStart = currentStart;
      bestEnd = currentEnd;
      bestHitCount = currentHitCount;
    }
    currentStart = value;
    currentEnd = value;
    currentHitCount = 1;
  }

  if (
    currentHitCount > bestHitCount ||
    (currentHitCount === bestHitCount && currentEnd - currentStart > bestEnd - bestStart)
  ) {
    bestStart = currentStart;
    bestEnd = currentEnd;
    bestHitCount = currentHitCount;
  }

  if (bestHitCount < minHitCount || bestEnd - bestStart < minSpan) {
    return null;
  }

  const padding = 2;
  return [
    Math.max(0, bestStart - padding),
    Math.min(signal.length, bestEnd + padding + 1),
  ];
}

function detectLightAxisGrid(image: RasterImage, axis: "x" | "y"): AxisGrid | null {
  const axisLength = axis === "x" ? image.width : image.height;
  const otherLength = axis === "x" ? image.height : image.width;
  if (axisLength < 12 || otherLength < 12) {
    return null;
  }

  const sampleStart = Math.max(0, Math.floor(otherLength * 0.08));
  const sampleEnd = Math.min(otherLength, Math.ceil(otherLength * 0.92));
  const sampleLength = Math.max(1, sampleEnd - sampleStart);
  const signal = new Float32Array(axisLength);
  for (let line = 0; line < axisLength; line += 1) {
    let matches = 0;
    for (let offset = sampleStart; offset < sampleEnd; offset += 1) {
      const pixel = axis === "x" ? getPixel(image, line, offset) : getPixel(image, offset, line);
      if (isLightSeparatorPixel(pixel)) {
        matches += 1;
      }
    }
    signal[line] = (matches / sampleLength) * 255;
  }

  return buildAxisGridFromSignal(signal, 6);
}

function detectDarkFrameBox(image: RasterImage): FrameBoxDetection | null {
  const strictMask = buildDarkMask(image, isVeryDarkNeutralPixel);
  const strictResult = findFrameBoxFromMask(image, strictMask);
  if (strictResult) {
    return strictResult;
  }

  const relaxedMask = buildDarkMask(image, isChartFramePixel);
  return findFrameBoxFromMask(image, relaxedMask);
}

function buildDarkMask(
  image: RasterImage,
  predicate: (pixel: Rgb) => boolean,
) {
  const darkMask = new Uint8Array(image.width * image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (predicate(getPixel(image, x, y))) {
        darkMask[y * image.width + x] = 1;
      }
    }
  }
  return darkMask;
}

function findFrameBoxFromMask(
  image: RasterImage,
  darkMask: Uint8Array,
): FrameBoxDetection | null {
  const visited = new Uint8Array(darkMask.length);
  let best: { outer: CropBox; inner: CropBox; score: number } | null = null;

  for (let startIndex = 0; startIndex < darkMask.length; startIndex += 1) {
    if (!darkMask[startIndex] || visited[startIndex]) {
      continue;
    }

    const component = collectDarkComponent(darkMask, visited, image.width, image.height, startIndex);
    const componentWidth = component.maxX - component.minX + 1;
    const componentHeight = component.maxY - component.minY + 1;
    if (
      componentWidth < image.width * 0.5 ||
      componentHeight < image.height * 0.4 ||
      component.pixelCount < (componentWidth + componentHeight) * 2
    ) {
      continue;
    }

    const candidate = scoreFrameCandidate(image, darkMask, component.minX, component.minY, component.maxX + 1, component.maxY + 1);
    if (!candidate) {
      continue;
    }

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best ? { outer: best.outer, inner: best.inner } : null;
}

function looksLikeChartLegend(image: RasterImage) {
  return scoreChartLegend(image) >= 0.52;
}

function scoreChartLegend(image: RasterImage) {
  const pixelCount = image.width * image.height;
  if (pixelCount <= 0) {
    return 0;
  }

  const quantizedColors = new Set<string>();
  let lightPixels = 0;
  let darkPixels = 0;
  let colorfulPixels = 0;

  for (let index = 0; index < image.data.length; index += 4) {
    const red = image.data[index] ?? 0;
    const green = image.data[index + 1] ?? 0;
    const blue = image.data[index + 2] ?? 0;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);

    if (luminance >= 214) {
      lightPixels += 1;
    }
    if (luminance <= 72) {
      darkPixels += 1;
    }
    if (chroma >= 34) {
      colorfulPixels += 1;
    }

    quantizedColors.add(
      `${Math.round(red / 24)}-${Math.round(green / 24)}-${Math.round(blue / 24)}`,
    );
  }

  const lightRatio = lightPixels / pixelCount;
  const darkRatio = darkPixels / pixelCount;
  const colorfulRatio = colorfulPixels / pixelCount;
  const quantizedScore = clamp01((quantizedColors.size - 6) / 14);
  const lightScore = clamp01((lightRatio - 0.18) / 0.3);
  const darkScore = clamp01((darkRatio - 0.002) / 0.03);
  const colorfulScore = clamp01((colorfulRatio - 0.012) / 0.08);

  return (
    quantizedScore * 0.34 +
    lightScore * 0.28 +
    colorfulScore * 0.24 +
    darkScore * 0.14
  );
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function firstIndexAtOrAbove(values: Int32Array, threshold: number) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] >= threshold) {
      return index;
    }
  }
  return null;
}

function lastIndexAtOrAbove(values: Int32Array, threshold: number) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] >= threshold) {
      return index;
    }
  }
  return null;
}

function detectDenseCountRange(values: Int32Array, minimumThreshold: number): [number, number] | null {
  if (values.length < 12) {
    return null;
  }

  let maxValue = 0;
  let sum = 0;
  for (const value of values) {
    maxValue = Math.max(maxValue, value);
    sum += value;
  }

  const mean = sum / Math.max(1, values.length);
  let variance = 0;
  for (const value of values) {
    variance += (value - mean) * (value - mean);
  }
  const stddev = Math.sqrt(variance / Math.max(1, values.length));
  const threshold = Math.max(
    minimumThreshold,
    Math.round(maxValue * 0.45),
    Math.round(mean + stddev * 0.9),
  );
  const maxGap = Math.max(2, Math.floor(values.length * 0.01));
  const minSpan = Math.max(12, Math.floor(values.length * 0.16));

  let bestStart = -1;
  let bestEnd = -1;
  let currentStart = -1;
  let lastHit = -1;

  for (let index = 0; index < values.length; index += 1) {
    if (values[index] >= threshold) {
      if (currentStart === -1) {
        currentStart = index;
      }
      lastHit = index;
      continue;
    }

    if (currentStart !== -1 && index - lastHit > maxGap) {
      if (lastHit - currentStart > bestEnd - bestStart) {
        bestStart = currentStart;
        bestEnd = lastHit;
      }
      currentStart = -1;
      lastHit = -1;
    }
  }

  if (currentStart !== -1 && lastHit - currentStart > bestEnd - bestStart) {
    bestStart = currentStart;
    bestEnd = lastHit;
  }

  if (bestStart === -1 || bestEnd === -1 || bestEnd - bestStart < minSpan) {
    return null;
  }

  const padding = 4;
  return [
    Math.max(0, bestStart - padding),
    Math.min(values.length, bestEnd + padding + 1),
  ];
}

function countLegendSwatches(image: RasterImage) {
  const mask = new Uint8Array(image.width * image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const [red, green, blue] = getPixel(image, x, y);
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
      if (luminance <= 246 && chroma >= 22) {
        mask[y * image.width + x] = 1;
      }
    }
  }

  const visited = new Uint8Array(mask.length);
  let count = 0;
  for (let startIndex = 0; startIndex < mask.length; startIndex += 1) {
    if (!mask[startIndex] || visited[startIndex]) {
      continue;
    }

    const component = collectDarkComponent(mask, visited, image.width, image.height, startIndex);
    const width = component.maxX - component.minX + 1;
    const height = component.maxY - component.minY + 1;
    if (
      width >= image.width * 0.045 &&
      height >= Math.max(6, image.height * 0.08) &&
      height <= image.height * 0.45 &&
      width / Math.max(1, height) >= 1.4
    ) {
      count += 1;
    }
  }

  return count;
}

function collectDarkComponent(
  darkMask: Uint8Array,
  visited: Uint8Array,
  width: number,
  height: number,
  startIndex: number,
) {
  const stack = [startIndex];
  visited[startIndex] = 1;
  let pixelCount = 0;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  while (stack.length > 0) {
    const index = stack.pop()!;
    const x = index % width;
    const y = Math.floor(index / width);
    pixelCount += 1;
    if (x < minX) {
      minX = x;
    }
    if (x > maxX) {
      maxX = x;
    }
    if (y < minY) {
      minY = y;
    }
    if (y > maxY) {
      maxY = y;
    }

    if (x > 0) {
      const next = index - 1;
      if (darkMask[next] && !visited[next]) {
        visited[next] = 1;
        stack.push(next);
      }
    }
    if (x + 1 < width) {
      const next = index + 1;
      if (darkMask[next] && !visited[next]) {
        visited[next] = 1;
        stack.push(next);
      }
    }
    if (y > 0) {
      const next = index - width;
      if (darkMask[next] && !visited[next]) {
        visited[next] = 1;
        stack.push(next);
      }
    }
    if (y + 1 < height) {
      const next = index + width;
      if (darkMask[next] && !visited[next]) {
        visited[next] = 1;
        stack.push(next);
      }
    }
  }

  return { minX, minY, maxX, maxY, pixelCount };
}

function scoreFrameCandidate(
  image: RasterImage,
  darkMask: Uint8Array,
  left: number,
  top: number,
  right: number,
  bottom: number,
) {
  const width = right - left;
  const height = bottom - top;
  if (
    width < image.width * 0.55 ||
    height < image.height * 0.45 ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  const thickness = inferFrameThickness(darkMask, image.width, image.height, left, top, right, bottom);
  const innerLeft = left + thickness.left;
  const innerTop = top + thickness.top;
  const innerRight = right - thickness.right;
  const innerBottom = bottom - thickness.bottom;
  if (
    innerRight - innerLeft < image.width * 0.45 ||
    innerBottom - innerTop < image.height * 0.35
  ) {
    return null;
  }

  const borderCoverage = measureFrameBorderCoverage(
    darkMask,
    image.width,
    image.height,
    left,
    top,
    right,
    bottom,
    thickness,
  );
  if (borderCoverage < 0.78) {
    return null;
  }

  const interiorDarkRatio = measureDarkRatio(
    darkMask,
    image.width,
    image.height,
    innerLeft,
    innerTop,
    innerRight,
    innerBottom,
  );
  if (interiorDarkRatio > 0.22) {
    return null;
  }

  const areaScore = (width * height) / (image.width * image.height);
  const score = areaScore * borderCoverage - interiorDarkRatio * 0.35;
  return {
    outer: [left, top, right, bottom] as CropBox,
    inner: [innerLeft, innerTop, innerRight, innerBottom] as CropBox,
    score,
  };
}

function inferFrameThickness(
  darkMask: Uint8Array,
  width: number,
  height: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
) {
  const sampleFractions = [0.2, 0.5, 0.8];
  const maxThickness = 18;
  const topSamples = sampleFractions.map((fraction) =>
    countDarkRunDownward(
      darkMask,
      width,
      height,
      left + Math.floor((right - left - 1) * fraction),
      top,
      bottom,
      maxThickness,
    ),
  );
  const bottomSamples = sampleFractions.map((fraction) =>
    countDarkRunUpward(
      darkMask,
      width,
      height,
      left + Math.floor((right - left - 1) * fraction),
      bottom - 1,
      top,
      maxThickness,
    ),
  );
  const leftSamples = sampleFractions.map((fraction) =>
    countDarkRunRightward(
      darkMask,
      width,
      height,
      left,
      top + Math.floor((bottom - top - 1) * fraction),
      right,
      maxThickness,
    ),
  );
  const rightSamples = sampleFractions.map((fraction) =>
    countDarkRunLeftward(
      darkMask,
      width,
      height,
      right - 1,
      top + Math.floor((bottom - top - 1) * fraction),
      left,
      maxThickness,
    ),
  );

  return {
    top: clampFrameThickness(medianOfSmallSet(topSamples)),
    bottom: clampFrameThickness(medianOfSmallSet(bottomSamples)),
    left: clampFrameThickness(medianOfSmallSet(leftSamples)),
    right: clampFrameThickness(medianOfSmallSet(rightSamples)),
  };
}

function measureFrameBorderCoverage(
  darkMask: Uint8Array,
  width: number,
  height: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  thickness: { top: number; bottom: number; left: number; right: number },
) {
  const topCoverage = measureDarkRatio(darkMask, width, height, left, top, right, top + thickness.top);
  const bottomCoverage = measureDarkRatio(darkMask, width, height, left, bottom - thickness.bottom, right, bottom);
  const leftCoverage = measureDarkRatio(
    darkMask,
    width,
    height,
    left,
    top + thickness.top,
    left + thickness.left,
    bottom - thickness.bottom,
  );
  const rightCoverage = measureDarkRatio(
    darkMask,
    width,
    height,
    right - thickness.right,
    top + thickness.top,
    right,
    bottom - thickness.bottom,
  );
  return Math.min(topCoverage, bottomCoverage, leftCoverage, rightCoverage);
}

function measureDarkRatio(
  darkMask: Uint8Array,
  width: number,
  height: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
) {
  const boundedLeft = Math.max(0, Math.min(width, left));
  const boundedTop = Math.max(0, Math.min(height, top));
  const boundedRight = Math.max(boundedLeft, Math.min(width, right));
  const boundedBottom = Math.max(boundedTop, Math.min(height, bottom));
  const area = (boundedRight - boundedLeft) * (boundedBottom - boundedTop);
  if (area <= 0) {
    return 0;
  }

  let darkCount = 0;
  for (let y = boundedTop; y < boundedBottom; y += 1) {
    for (let x = boundedLeft; x < boundedRight; x += 1) {
      darkCount += darkMask[y * width + x];
    }
  }
  return darkCount / area;
}

function countDarkRunDownward(
  darkMask: Uint8Array,
  width: number,
  height: number,
  x: number,
  startY: number,
  endY: number,
  maxThickness: number,
) {
  let count = 0;
  for (let y = startY; y < Math.min(endY, startY + maxThickness); y += 1) {
    if (!darkMask[y * width + x]) {
      break;
    }
    count += 1;
  }
  return count;
}

function countDarkRunUpward(
  darkMask: Uint8Array,
  width: number,
  height: number,
  x: number,
  startY: number,
  endY: number,
  maxThickness: number,
) {
  let count = 0;
  for (let y = startY; y >= Math.max(endY, startY - maxThickness + 1); y -= 1) {
    if (!darkMask[y * width + x]) {
      break;
    }
    count += 1;
  }
  return count;
}

function countDarkRunRightward(
  darkMask: Uint8Array,
  width: number,
  height: number,
  startX: number,
  y: number,
  endX: number,
  maxThickness: number,
) {
  let count = 0;
  for (let x = startX; x < Math.min(endX, startX + maxThickness); x += 1) {
    if (!darkMask[y * width + x]) {
      break;
    }
    count += 1;
  }
  return count;
}

function countDarkRunLeftward(
  darkMask: Uint8Array,
  width: number,
  height: number,
  startX: number,
  y: number,
  endX: number,
  maxThickness: number,
) {
  let count = 0;
  for (let x = startX; x >= Math.max(endX, startX - maxThickness + 1); x -= 1) {
    if (!darkMask[y * width + x]) {
      break;
    }
    count += 1;
  }
  return count;
}

function medianOfSmallSet(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function clampFrameThickness(value: number) {
  return Math.max(2, Math.min(18, value || 2));
}

function isVeryDarkNeutralPixel(pixel: Rgb) {
  const [red, green, blue] = pixel;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  return luminance <= 72 && chroma <= 42;
}

function isChartFramePixel(pixel: Rgb) {
  const [red, green, blue] = pixel;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  return luminance <= 112 && chroma <= 88;
}

function isLooseContentPixel(pixel: Rgb) {
  const [red, green, blue] = pixel;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  return luminance <= 246 || chroma >= 14;
}

function isLightSeparatorPixel(pixel: Rgb) {
  const [red, green, blue] = pixel;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  return luminance >= 168 && luminance <= 244 && chroma <= 24;
}

function detectGappedAxis(image: RasterImage, axis: "x" | "y"): Segment[] | null {
  const signal = smoothSignal(buildEdgeSignal(image, axis));
  const axisLength = signal.length + 1;
  const period = dominantAutocorrelationPeriod(signal, 3);
  if (!period) {
    return null;
  }

  const phaseScores = new Float32Array(period);
  const phaseCounts = new Int32Array(period);
  for (let index = 0; index < signal.length; index += 1) {
    const phase = index % period;
    phaseScores[phase] += signal[index];
    phaseCounts[phase] += 1;
  }

  for (let index = 0; index < period; index += 1) {
    if (phaseCounts[index] > 0) {
      phaseScores[index] /= phaseCounts[index];
    }
  }

  const cellSpan = longestLowPhaseSpan(phaseScores);
  if (!cellSpan) {
    return null;
  }

  const [spanStart, spanLength] = cellSpan;
  const segments: Segment[] = [];
  let current = spanStart;
  while (current + spanLength <= axisLength) {
    if (current >= 0) {
      segments.push([current, current + spanLength]);
    }
    current += period;
  }

  if (segments.length < DEFAULT_MIN_GRID_CELLS) {
    return null;
  }

  const trimThreshold = Math.max(2, Math.round(spanLength * 0.8));
  const trimmed = segments.filter(
    ([start, end]) => start >= 0 && end <= axisLength && end - start >= trimThreshold,
  );
  if (trimmed.length < DEFAULT_MIN_GRID_CELLS) {
    return null;
  }

  return trimmed;
}

function detectPeriodFromSignal(signal: Float32Array, minPeriod: number) {
  return buildAxisGridFromSignal(signal, minPeriod);
}

function buildAxisGridFromSignal(signal: Float32Array, minPeriod: number): AxisGrid | null {
  if (signal.length < minPeriod * 4) {
    return null;
  }

  const smoothed = smoothSignal(signal);
  const mean = arrayMean(smoothed);
  const stddev = arrayStandardDeviation(smoothed, mean);
  const threshold = Math.max(mean + stddev * 0.6, mean + 3);
  const candidates = localMaxima(smoothed, threshold);
  if (candidates.length < 4) {
    return null;
  }

  const diffs: number[] = [];
  for (let index = 0; index < candidates.length - 1; index += 1) {
    const diff = candidates[index + 1] - candidates[index];
    if (diff >= minPeriod) {
      diffs.push(diff);
    }
  }

  const period = dominantPeriod(diffs, minPeriod);
  if (!period) {
    return null;
  }

  const tolerance = Math.max(Math.round(period * 0.12), 2);
  const startGapThreshold = Math.max(Math.floor(period / 2), 2);
  const sequence = longestSequence(candidates, period, tolerance, startGapThreshold);
  if (sequence.length < 4) {
    return null;
  }

  return {
    period,
    firstLine: sequence[0],
    lastLine: sequence[sequence.length - 1],
    sequenceCount: sequence.length,
  };
}

function smoothSignal(signal: Float32Array) {
  if (signal.length < 3) {
    return new Float32Array(signal);
  }

  const result = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) {
    const left = signal[Math.max(0, index - 1)];
    const center = signal[index];
    const right = signal[Math.min(signal.length - 1, index + 1)];
    result[index] = left * 0.25 + center * 0.5 + right * 0.25;
  }
  return result;
}

function buildEdgeSignal(image: RasterImage, axis: "x" | "y") {
  if (axis === "x") {
    const signal = new Float32Array(Math.max(0, image.width - 1));
    for (let x = 0; x < image.width - 1; x += 1) {
      let sum = 0;
      for (let y = 0; y < image.height; y += 1) {
        const left = getPixel(image, x, y);
        const right = getPixel(image, x + 1, y);
        sum +=
          (Math.abs(left[0] - right[0]) +
            Math.abs(left[1] - right[1]) +
            Math.abs(left[2] - right[2])) /
          3;
      }
      signal[x] = sum / image.height;
    }
    return signal;
  }

  const signal = new Float32Array(Math.max(0, image.height - 1));
  for (let y = 0; y < image.height - 1; y += 1) {
    let sum = 0;
    for (let x = 0; x < image.width; x += 1) {
      const top = getPixel(image, x, y);
      const bottom = getPixel(image, x, y + 1);
      sum +=
        (Math.abs(top[0] - bottom[0]) +
          Math.abs(top[1] - bottom[1]) +
          Math.abs(top[2] - bottom[2])) /
        3;
    }
    signal[y] = sum / image.width;
  }
  return signal;
}

function localMaxima(signal: Float32Array, threshold: number) {
  const maxima: number[] = [];
  for (let index = 1; index < signal.length - 1; index += 1) {
    const value = signal[index];
    if (value < threshold) {
      continue;
    }
    if (value >= signal[index - 1] && value >= signal[index + 1]) {
      maxima.push(index);
    }
  }
  return maxima;
}

function dominantPeriod(diffs: number[], minPeriod: number) {
  if (!diffs.length) {
    return null;
  }

  const counts = new Map<number, number>();
  for (const diff of diffs) {
    counts.set(diff, (counts.get(diff) ?? 0) + 1);
  }

  let bestPeriod: number | null = null;
  let bestScore = -1;
  const lower = Math.max(minPeriod, Math.min(...diffs));
  const upper = Math.max(...diffs);

  for (let period = lower; period <= upper; period += 1) {
    const tolerance = Math.max(Math.round(period * 0.1), 1);
    let score = 0;
    for (const [diff, count] of counts.entries()) {
      if (Math.abs(diff - period) <= tolerance) {
        score += count;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestPeriod = period;
    }
  }

  if (bestPeriod === null || bestScore < 3) {
    return null;
  }
  return bestPeriod;
}

function dominantAutocorrelationPeriod(signal: Float32Array, minPeriod: number) {
  if (signal.length < minPeriod * 4) {
    return null;
  }

  const mean = arrayMean(signal);
  const centered = new Float32Array(signal.length);
  let variance = 0;
  for (let index = 0; index < signal.length; index += 1) {
    centered[index] = signal[index] - mean;
    variance += centered[index] * centered[index];
  }
  if (variance <= 0) {
    return null;
  }

  const maxPeriod = Math.min(128, Math.floor(signal.length / 2));
  let bestPeriod: number | null = null;
  let bestScore = -1;
  const scores: Array<[number, number]> = [];

  for (let period = minPeriod; period <= maxPeriod; period += 1) {
    let dot = 0;
    let lhsNorm = 0;
    let rhsNorm = 0;
    for (let index = 0; index < centered.length - period; index += 1) {
      const lhs = centered[index];
      const rhs = centered[index + period];
      dot += lhs * rhs;
      lhsNorm += lhs * lhs;
      rhsNorm += rhs * rhs;
    }

    const denom = Math.sqrt(lhsNorm) * Math.sqrt(rhsNorm);
    if (denom <= 0) {
      continue;
    }
    const score = dot / denom;
    scores.push([period, score]);
    if (score > bestScore) {
      bestScore = score;
      bestPeriod = period;
    }
  }

  if (bestPeriod === null || bestScore < 0.18) {
    return null;
  }

  for (let divisor = 2; divisor <= 4; divisor += 1) {
    if (bestPeriod % divisor !== 0) {
      continue;
    }
    const smaller = Math.floor(bestPeriod / divisor);
    for (const [period, score] of scores) {
      if (period === smaller && score >= Math.max(0.18, bestScore * 0.9)) {
        bestPeriod = smaller;
        bestScore = score;
        break;
      }
    }
  }

  const nearBest = scores
    .filter(([, score]) => score >= Math.max(0.18, bestScore * 0.92))
    .map(([period]) => period);
  return nearBest.length ? Math.min(...nearBest) : bestPeriod;
}

function longestLowPhaseSpan(phaseScores: Float32Array): [number, number] | null {
  if (!phaseScores.length) {
    return null;
  }

  let maxValue = -Infinity;
  let sum = 0;
  for (const value of phaseScores) {
    sum += value;
    maxValue = Math.max(maxValue, value);
  }
  const mean = sum / phaseScores.length;
  const threshold = mean + (maxValue - mean) * 0.4;
  const boundaryMask = new Array<boolean>(phaseScores.length).fill(false);
  let hasBoundary = false;
  for (let index = 0; index < phaseScores.length; index += 1) {
    const value = phaseScores[index] >= threshold;
    boundaryMask[index] = value;
    hasBoundary ||= value;
  }
  if (!hasBoundary) {
    return null;
  }

  const widened = new Array<boolean>(phaseScores.length).fill(false);
  for (let index = 0; index < phaseScores.length; index += 1) {
    if (!boundaryMask[index]) {
      continue;
    }
    widened[index] = true;
    widened[(index - 1 + phaseScores.length) % phaseScores.length] = true;
    widened[(index + 1) % phaseScores.length] = true;
  }

  const lowMask = widened.map((value) => !value);
  if (!lowMask.some(Boolean)) {
    return null;
  }

  const doubled = [...lowMask, ...lowMask];
  let bestStart: number | null = null;
  let bestLength = 0;
  let currentStart: number | null = null;
  let currentLength = 0;

  for (let index = 0; index < doubled.length; index += 1) {
    if (doubled[index]) {
      if (currentStart === null) {
        currentStart = index;
        currentLength = 1;
      } else {
        currentLength += 1;
      }
      if (currentLength > bestLength && currentLength <= phaseScores.length) {
        bestStart = currentStart;
        bestLength = currentLength;
      }
    } else {
      currentStart = null;
      currentLength = 0;
    }
  }

  if (bestStart === null || bestLength < Math.max(2, Math.floor(phaseScores.length / 3))) {
    return null;
  }

  return [bestStart % phaseScores.length, bestLength];
}

function longestSequence(
  candidates: number[],
  period: number,
  tolerance: number,
  startGapThreshold: number,
) {
  const sorted = [...candidates].sort((left, right) => left - right);
  let best: number[] = [];

  for (let startIndex = 0; startIndex < sorted.length; startIndex += 1) {
    const startLine = sorted[startIndex];
    if (startIndex > 0) {
      const previousGap = startLine - sorted[startIndex - 1];
      if (previousGap < startGapThreshold) {
        continue;
      }
    }

    const sequence = [startLine];
    let currentLine = startLine;
    let currentIndex = startIndex;

    while (true) {
      const targetLine = currentLine + period;
      let bestNextLine: number | null = null;
      let bestNextIndex: number | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (let nextIndex = currentIndex + 1; nextIndex < sorted.length; nextIndex += 1) {
        const candidateLine = sorted[nextIndex];
        if (candidateLine > targetLine + tolerance) {
          break;
        }

        const distance = Math.abs(candidateLine - targetLine);
        if (distance <= tolerance && distance < bestDistance) {
          bestNextLine = candidateLine;
          bestNextIndex = nextIndex;
          bestDistance = distance;
        }
      }

      if (bestNextLine === null || bestNextIndex === null) {
        break;
      }

      sequence.push(bestNextLine);
      currentLine = bestNextLine;
      currentIndex = bestNextIndex;
    }

    if (sequence.length > best.length) {
      best = sequence;
    }
  }

  return best;
}

function isReasonableGrid(gridWidth: number, gridHeight: number) {
  return (
    gridWidth >= DEFAULT_MIN_GRID_CELLS &&
    gridWidth <= DEFAULT_MAX_GRID_CELLS &&
    gridHeight >= DEFAULT_MIN_GRID_CELLS &&
    gridHeight <= DEFAULT_MAX_GRID_CELLS
  );
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
      data[targetIndex + 3] = 255;
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

function offsetCropBox(base: CropBox, inner: CropBox): CropBox {
  return [
    base[0] + inner[0],
    base[1] + inner[1],
    base[0] + inner[2],
    base[1] + inner[3],
  ];
}

function sampleSegments(image: RasterImage, xSegments: Segment[], ySegments: Segment[]) {
  const data = new Uint8ClampedArray(xSegments.length * ySegments.length * 4);
  for (let row = 0; row < ySegments.length; row += 1) {
    const [top, bottom] = ySegments[row];
    for (let column = 0; column < xSegments.length; column += 1) {
      const [left, right] = xSegments[column];
      const color = averagePatch(image, left, top, right, bottom);
      const index = (row * xSegments.length + column) * 4;
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = 255;
    }
  }
  return { width: xSegments.length, height: ySegments.length, data };
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
    data[index + 3] = 255;
  }
  return { width: image.width, height: image.height, data };
}

function boxBlur(image: RasterImage): RasterImage {
  const data = new Uint8ClampedArray(image.data.length);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const sums = [0, 0, 0];
      let count = 0;
      for (let sampleY = Math.max(0, y - 1); sampleY <= Math.min(image.height - 1, y + 1); sampleY += 1) {
        for (let sampleX = Math.max(0, x - 1); sampleX <= Math.min(image.width - 1, x + 1); sampleX += 1) {
          const pixel = getPixel(image, sampleX, sampleY);
          sums[0] += pixel[0];
          sums[1] += pixel[1];
          sums[2] += pixel[2];
          count += 1;
        }
      }
      const index = (y * image.width + x) * 4;
      data[index] = clampToByte(sums[0] / count);
      data[index + 1] = clampToByte(sums[1] / count);
      data[index + 2] = clampToByte(sums[2] / count);
      data[index + 3] = 255;
    }
  }
  return { width: image.width, height: image.height, data };
}

function representativeColorFromPatch(
  image: RasterImage,
  left: number,
  top: number,
  right: number,
  bottom: number,
): Rgb {
  const buckets = new Map<number, { count: number; sum: [number, number, number] }>();
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const pixel = getPixel(image, x, y);
      const code = ((pixel[0] >> 4) << 8) | ((pixel[1] >> 4) << 4) | (pixel[2] >> 4);
      const current = buckets.get(code) ?? { count: 0, sum: [0, 0, 0] };
      current.count += 1;
      current.sum[0] += pixel[0];
      current.sum[1] += pixel[1];
      current.sum[2] += pixel[2];
      buckets.set(code, current);
    }
  }

  if (!buckets.size) {
    return [255, 255, 255];
  }

  let best: { count: number; sum: [number, number, number] } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) {
      best = bucket;
    }
  }
  if (!best) {
    return [255, 255, 255];
  }

  return [
    clampToByte(best.sum[0] / best.count),
    clampToByte(best.sum[1] / best.count),
    clampToByte(best.sum[2] / best.count),
  ];
}

function sampleRegularGrid(image: RasterImage, gridWidth: number, gridHeight: number): RasterImage {
  const xEdges = buildEdges(image.width, gridWidth);
  const yEdges = buildEdges(image.height, gridHeight);
  const data = new Uint8ClampedArray(gridWidth * gridHeight * 4);

  for (let row = 0; row < gridHeight; row += 1) {
    const top = yEdges[row];
    const bottom = Math.max(yEdges[row + 1], top + 1);
    for (let column = 0; column < gridWidth; column += 1) {
      const left = xEdges[column];
      const right = Math.max(xEdges[column + 1], left + 1);
      const color = representativeColorFromPatch(image, left, top, right, bottom);
      const index = (row * gridWidth + column) * 4;
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = 255;
    }
  }

  return { width: gridWidth, height: gridHeight, data };
}

function convertImageToLogicalGrid(
  image: RasterImage,
  gridWidth: number,
  gridHeight: number,
  preSharpenEnabled: boolean,
  preSharpenStrength: number,
) {
  let cropped = centerCropToRatio(image, gridWidth / gridHeight);
  if (preSharpenEnabled) {
    cropped = applySharpen(cropped, preSharpenStrength);
  }
  return sampleRegularGrid(cropped, gridWidth, gridHeight);
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

function matchPalette(logical: RasterImage, paletteDefinition: PaletteDefinition) {
  const cells: EditableCell[] = [];

  for (let index = 0; index < logical.width * logical.height; index += 1) {
    const pixelIndex = index * 4;
    const rgb: Rgb = [
      logical.data[pixelIndex],
      logical.data[pixelIndex + 1],
      logical.data[pixelIndex + 2],
    ];
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

    cells.push(normalizeEditableCell({
      label: best.label,
      hex: best.hex,
    }));
  }

  return { cells };
}

function reduceColorsPhotoshopStyle(image: RasterImage, tolerance: number) {
  const indexByColor = new Map<number, number>();
  const uniqueColors: Rgb[] = [];
  const counts: number[] = [];
  const inverse = new Int32Array(image.width * image.height);

  for (let index = 0; index < image.width * image.height; index += 1) {
    const pixelIndex = index * 4;
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

  const sortOrder = uniqueColors
    .map((_, index) => index)
    .sort((left, right) => counts[right] - counts[left]);
  const representatives: Array<{ rgb: [number, number, number]; oklab: Oklab; weight: number }> = [];
  const colorToCluster = new Int32Array(originalUniqueColors);

  for (const colorIndex of sortOrder) {
    const color = uniqueColors[colorIndex];
    const oklab = rgbToOklab(color);
    let assignedCluster = -1;

    for (let clusterIndex = 0; clusterIndex < representatives.length; clusterIndex += 1) {
      const distance = Math.sqrt(oklabDistanceSquared(oklab, representatives[clusterIndex].oklab)) * 255;
      if (distance <= tolerance) {
        assignedCluster = clusterIndex;
        break;
      }
    }

    if (assignedCluster === -1) {
      representatives.push({
        rgb: [color[0], color[1], color[2]],
        oklab,
        weight: counts[colorIndex],
      });
      assignedCluster = representatives.length - 1;
    } else {
      const representative = representatives[assignedCluster];
      const weight = representative.weight;
      const colorWeight = counts[colorIndex];
      representative.rgb = [
        (representative.rgb[0] * weight + color[0] * colorWeight) / (weight + colorWeight),
        (representative.rgb[1] * weight + color[1] * colorWeight) / (weight + colorWeight),
        (representative.rgb[2] * weight + color[2] * colorWeight) / (weight + colorWeight),
      ];
      representative.oklab = rgbToOklab([
        clampToByte(representative.rgb[0]),
        clampToByte(representative.rgb[1]),
        clampToByte(representative.rgb[2]),
      ]);
      representative.weight = weight + colorWeight;
    }

    colorToCluster[colorIndex] = assignedCluster;
  }

  const data = new Uint8ClampedArray(image.data.length);
  for (let index = 0; index < image.width * image.height; index += 1) {
    const cluster = representatives[colorToCluster[inverse[index]]];
    const pixelIndex = index * 4;
    data[pixelIndex] = clampToByte(cluster.rgb[0]);
    data[pixelIndex + 1] = clampToByte(cluster.rgb[1]);
    data[pixelIndex + 2] = clampToByte(cluster.rgb[2]);
    data[pixelIndex + 3] = 255;
  }

  const globallyReducedImage = {
    width: image.width,
    height: image.height,
    data,
  };
  const neighborhoodReducedImage = mergeRareNeighborhoodColors(
    globallyReducedImage,
    tolerance,
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
) {
  if (tolerance <= 0 || image.width <= 0 || image.height <= 0) {
    return image;
  }

  const pixelCount = image.width * image.height;
  const codes = new Int32Array(pixelCount);
  const counts = new Map<number, number>();
  for (let index = 0; index < pixelCount; index += 1) {
    const pixelIndex = index * 4;
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

  for (let index = 0; index < pixelCount; index += 1) {
    const currentCode = codes[index];
    const currentCount = counts.get(currentCode) ?? 0;
    if (currentCount <= 0 || currentCount > rareColorLimit) {
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
        if (neighborCode === currentCode) {
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

    const currentOklab = getCodeOklab(currentCode);
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
    nextData[pixelIndex + 3] = 255;
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

function renderChart(
  cells: EditableCell[],
  colors: ColorCount[],
  gridWidth: number,
  gridHeight: number,
  cellSize: number,
  title: string,
  metaLine: string,
  canvasContextUnavailableMessage: string,
) {
  const cellGap = Math.max(1, Math.floor(cellSize / 18));
  const frame = Math.max(4, Math.floor(cellSize / 7));
  const boardWidth = gridWidth * cellSize;
  const boardHeight = gridHeight * cellSize;
  const canvasPadding = Math.max(24, cellSize);
  const titleGap = Math.max(16, Math.floor(cellSize / 2));

  const labelFontSize = Math.max(10, Math.floor(cellSize * 0.34));
  const brandFontSize = Math.max(28, Math.floor(cellSize * 0.82));
  const titleFontSize = Math.max(19, Math.floor(cellSize * 0.56));
  const metaFontSize = Math.max(15, Math.floor(cellSize * 0.4));
  const legendLabelFontSize = Math.max(14, Math.floor(cellSize * 0.4));
  const legendCountFontSize = Math.max(14, Math.floor(cellSize * 0.35));
  const logoSize = Math.max(42, Math.floor(cellSize * 1.34));
  const brandRowHeight = Math.max(logoSize, brandFontSize) + 16;
  const metaRowHeight = metaLine ? metaFontSize + Math.max(12, Math.floor(cellSize * 0.24)) : 0;

  const legendTileWidth = Math.max(88, Math.floor(cellSize * 2.08));
  const legendSwatchHeight = Math.max(46, Math.floor(cellSize * 1.08));
  const legendTileHeight = legendSwatchHeight + Math.max(30, Math.floor(cellSize * 0.82));
  const legendGap = Math.max(10, Math.floor(cellSize / 4));

  const baseCanvasWidth = Math.max(boardWidth + canvasPadding * 2 + frame * 2, 900);
  const itemsPerRow = Math.max(
    1,
    Math.floor((baseCanvasWidth - canvasPadding * 2 + legendGap) / (legendTileWidth + legendGap)),
  );
  const legendRows = Math.max(1, Math.ceil(colors.length / itemsPerRow));
  const legendHeight =
    legendRows * legendTileHeight + Math.max(0, legendRows - 1) * legendGap;

  const canvasWidth = Math.max(
    baseCanvasWidth,
    itemsPerRow * legendTileWidth + Math.max(0, itemsPerRow - 1) * legendGap + canvasPadding * 2,
  );
  const canvasHeight =
    canvasPadding +
    brandRowHeight +
    titleGap +
    titleFontSize +
    metaRowHeight +
    titleGap +
    boardHeight +
    frame * 2 +
    titleGap +
    legendHeight +
    canvasPadding;

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
  const brandBlockWidth = estimateTextWidth(brandFontSize, true, true, BRAND_NAME) + logoSize + 18;
  const brandStartX = Math.round((canvasWidth - brandBlockWidth) / 2);
  drawBrandLogo(context, brandStartX, brandRowY - logoSize / 2, logoSize);
  context.font = buildFont(brandFontSize, true, true);
  context.fillStyle = "#1C1C1C";
  context.fillText(BRAND_NAME, brandStartX + logoSize + 18, brandRowY);

  context.textAlign = "center";
  context.font = buildFont(titleFontSize, true, true);
  context.fillText(title, canvasWidth / 2, canvasPadding + brandRowHeight + titleGap + titleFontSize / 2);

  if (metaLine) {
    context.font = buildFont(metaFontSize, false, false);
    context.fillStyle = "#5E5346";
    context.fillText(
      metaLine,
      canvasWidth / 2,
      canvasPadding + brandRowHeight + titleGap + titleFontSize + metaFontSize / 2 + 8,
    );
  }

  const boardOuterX = Math.floor((canvasWidth - (boardWidth + frame * 2)) / 2);
  const boardOuterY =
    canvasPadding + brandRowHeight + titleGap + titleFontSize + metaRowHeight + titleGap;
  const boardInnerX = boardOuterX + frame;
  const boardInnerY = boardOuterY + frame;

  context.fillStyle = BOARD_FRAME_COLOR;
  context.fillRect(boardOuterX, boardOuterY, boardWidth + frame * 2, boardHeight + frame * 2);

  context.font = buildFont(labelFontSize, true, false);
  for (let row = 0; row < gridHeight; row += 1) {
    for (let column = 0; column < gridWidth; column += 1) {
      const index = row * gridWidth + column;
      const x = boardInnerX + column * cellSize;
      const y = boardInnerY + row * cellSize;
      const cell = normalizeEditableCell(cells[index] ?? { label: null, hex: null });
      const fillRgb: Rgb = cell.hex ? hexToRgb(cell.hex) : [243, 238, 229];
      context.fillStyle = rgbToCss(fillRgb);
      context.fillRect(x, y, cellSize, cellSize);
      context.strokeStyle = GRID_SEPARATOR_COLOR;
      context.lineWidth = cellGap;
      context.strokeRect(x, y, cellSize, cellSize);

      const label = cell.label;
      if (!label) {
        continue;
      }
      const textFill = chooseTextColor(fillRgb);
      context.lineWidth = 2;
      context.strokeStyle = textFill === "#FFFFFF" ? "#111111" : "#FFFFFF";
      context.fillStyle = textFill;
      context.strokeText(label, x + cellSize / 2, y + cellSize / 2);
      context.fillText(label, x + cellSize / 2, y + cellSize / 2);
    }
  }

  const legendTop = boardOuterY + boardHeight + frame * 2 + titleGap;
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

  return canvas;
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

function collapseOpenBackgroundAreas(
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

  for (let index = 0; index < normalizedCells.length; index += 1) {
    if (visited[index]) {
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
          visited[neighborIndex]
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

function normalizeEditableCell(cell: EditableCell): EditableCell {
  if (!cell.label || !cell.hex) {
    return { label: null, hex: null };
  }

  return {
    label: cell.label,
    hex: cell.hex.toUpperCase(),
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
      data[targetIndex + 3] = 255;
    }
  }
  return { width, height, data };
}

function reconstructSegments(
  logical: RasterImage,
  xSegments: Segment[],
  ySegments: Segment[],
  cropBox: CropBox,
): RasterImage {
  const width = cropBox[2] - cropBox[0];
  const height = cropBox[3] - cropBox[1];
  const data = new Uint8ClampedArray(width * height * 4);

  for (let row = 0; row < ySegments.length; row += 1) {
    for (let column = 0; column < xSegments.length; column += 1) {
      const [left, right] = xSegments[column];
      const [top, bottom] = ySegments[row];
      const logicalIndex = (row * logical.width + column) * 4;
      for (let y = top - cropBox[1]; y < bottom - cropBox[1]; y += 1) {
        for (let x = left - cropBox[0]; x < right - cropBox[0]; x += 1) {
          const targetIndex = (y * width + x) * 4;
          data[targetIndex] = logical.data[logicalIndex];
          data[targetIndex + 1] = logical.data[logicalIndex + 1];
          data[targetIndex + 2] = logical.data[logicalIndex + 2];
          data[targetIndex + 3] = 255;
        }
      }
    }
  }

  return { width, height, data };
}

function averagePatch(
  image: RasterImage,
  left: number,
  top: number,
  right: number,
  bottom: number,
): Rgb {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const pixel = getPixel(image, x, y);
      sumR += pixel[0];
      sumG += pixel[1];
      sumB += pixel[2];
      count += 1;
    }
  }

  if (!count) {
    return [255, 255, 255];
  }

  return [
    clampToByte(sumR / count),
    clampToByte(sumG / count),
    clampToByte(sumB / count),
  ];
}

function meanAbsoluteError(left: RasterImage, right: RasterImage) {
  if (left.width !== right.width || left.height !== right.height) {
    return Number.POSITIVE_INFINITY;
  }

  let total = 0;
  for (let index = 0; index < left.width * left.height; index += 1) {
    const pixelIndex = index * 4;
    total += Math.abs(left.data[pixelIndex] - right.data[pixelIndex]);
    total += Math.abs(left.data[pixelIndex + 1] - right.data[pixelIndex + 1]);
    total += Math.abs(left.data[pixelIndex + 2] - right.data[pixelIndex + 2]);
  }
  return total / (left.width * left.height * 3);
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

function arrayStandardDeviation(signal: Float32Array, mean: number) {
  let sum = 0;
  for (const value of signal) {
    const delta = value - mean;
    sum += delta * delta;
  }
  return Math.sqrt(sum / signal.length);
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
