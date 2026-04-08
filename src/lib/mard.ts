import paletteJson from "../data/mard-palette-221.json";
import colorSystemMappingJson from "../data/color-system-mapping.json";

const DEFAULT_MIN_GRID_CELLS = 4;
const DEFAULT_MAX_GRID_CELLS = 512;
const GRID_SEPARATOR_COLOR = "#C9C4BC";
const BOARD_FRAME_COLOR = "#111111";
const CANVAS_BACKGROUND = "#F7F4EE";
const OMITTED_BACKGROUND_HEX = "#FFFFFF";
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
    const chartImport = detectChartLikePixelArt(source, file.name);
    if (chartImport) {
      logical = chartImport.logical;
      gridWidth = chartImport.gridWidth;
      gridHeight = chartImport.gridHeight;
      detectionMode = chartImport.mode;
      preferredEditorMode = "pindou";
      detectedCropRect = cropBoxToNormalizedCropRect(source.width, source.height, chartImport.cropBox);
    } else {
      const detection = detectPixelArt(source);
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

    if (preferredEditorMode !== "pindou" && shouldDefaultToPindouMode(source, file.name)) {
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
): AutoDetectionDebugResult {
  const raster: RasterImage = {
    width: image.width,
    height: image.height,
    data: image.data,
  };
  const chartImport = detectChartLikePixelArt(raster, fileName);
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

  const detection = detectPixelArt(raster);
  const preferredEditorMode = shouldDefaultToPindouMode(raster, fileName) ? "pindou" : "edit";
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
  if (!frameBox) {
    return null;
  }

  const legendRegion = cropRaster(
    image,
    [0, frameBox.outer[3], image.width, image.height],
  );
  if (!isPlausibleChartImportLayout(image, frameBox, legendRegion, fileName)) {
    return null;
  }
  if (!looksLikeChartLegend(legendRegion)) {
    return null;
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
    mode: `${boardDetection.mode}+chart-frame`,
    cropBox: offsetCropBox(frameBox.inner, boardDetection.cropBox),
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

  const edgeAligned =
    marginLeft <= Math.max(20, image.width * 0.06) &&
    marginRight <= Math.max(20, image.width * 0.06) &&
    marginTop <= Math.max(20, image.height * 0.06);

  return (
    edgeAligned &&
    widthRatio >= 0.78 &&
    heightRatio >= 0.48 &&
    legendRatio >= 0.1 &&
    legendRatio <= 0.42 &&
    legendIsTallEnough
  );
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

  const gridWidth = Math.round(image.width / xAxis.period);
  const gridHeight = Math.round(image.height / yAxis.period);
  if (!isReasonableGrid(gridWidth, gridHeight)) {
    return null;
  }

  return {
    gridWidth,
    gridHeight,
    cropBox: [0, 0, image.width, image.height],
    mode: "detected-light-gridlines",
  };
}

function detectLightAxisGrid(image: RasterImage, axis: "x" | "y"): AxisGrid | null {
  const axisLength = axis === "x" ? image.width : image.height;
  const otherLength = axis === "x" ? image.height : image.width;
  if (axisLength < 12 || otherLength < 12) {
    return null;
  }

  const signal = new Float32Array(axisLength);
  for (let line = 0; line < axisLength; line += 1) {
    let matches = 0;
    for (let offset = 0; offset < otherLength; offset += 1) {
      const pixel = axis === "x" ? getPixel(image, line, offset) : getPixel(image, offset, line);
      if (isLightSeparatorPixel(pixel)) {
        matches += 1;
      }
    }
    signal[line] = (matches / otherLength) * 255;
  }

  return buildAxisGridFromSignal(signal, 6);
}

function detectDarkFrameBox(image: RasterImage): FrameBoxDetection | null {
  const darkMask = new Uint8Array(image.width * image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (isVeryDarkNeutralPixel(getPixel(image, x, y))) {
        darkMask[y * image.width + x] = 1;
      }
    }
  }

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
  const pixelCount = image.width * image.height;
  if (pixelCount <= 0) {
    return false;
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

  return (
    quantizedColors.size >= 10 &&
    lightPixels / pixelCount >= 0.22 &&
    darkPixels / pixelCount >= 0.008 &&
    colorfulPixels / pixelCount >= 0.025
  );
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

function isLightSeparatorPixel(pixel: Rgb) {
  const [red, green, blue] = pixel;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  return luminance >= 176 && luminance <= 228 && chroma <= 18;
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
  const logoSize = Math.max(30, Math.floor(cellSize * 0.96));
  const brandRowHeight = Math.max(logoSize, brandFontSize) + 14;
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
  const brandBlockWidth = estimateTextWidth(brandFontSize, true, true, BRAND_NAME) + logoSize + 14;
  const brandStartX = Math.round((canvasWidth - brandBlockWidth) / 2);
  drawBrandLogo(context, brandStartX, brandRowY - logoSize / 2, logoSize);
  context.font = buildFont(brandFontSize, true, true);
  context.fillStyle = "#1C1C1C";
  context.fillText(BRAND_NAME, brandStartX + logoSize + 14, brandRowY);

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
