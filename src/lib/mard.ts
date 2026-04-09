import paletteJson from "../data/mard-palette-221.json";
import colorSystemMappingJson from "../data/color-system-mapping.json";
import {
  detectAutoRasterWithWasm,
  detectChartBoardWithWasm,
  type WasmAutoDetection,
} from "./detecter";

const GRID_SEPARATOR_COLOR = "#C9C4BC";
const BOARD_FRAME_COLOR = "#111111";
const CANVAS_BACKGROUND = "#F7F4EE";
const OMITTED_BACKGROUND_HEX = "#FFFFFF";
const MAX_DETECTION_EDGE = 768;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_IHDR_CHUNK = "IHDR";
const PNG_ITXT_CHUNK = "iTXt";
const CHART_METADATA_KEYWORD = "pindou-chart";
const CHART_METADATA_APP = "pindou";
const CHART_METADATA_VERSION = 1;
const BRAND_NAME = "拼豆豆";
const CHART_EDGE_SAMPLE_PROGRESS = [0.15, 0.2, 0.3, 0.35];
const CHART_EDGE_SAMPLE_INSET = 0.18;

type CropBox = [number, number, number, number];
type Rgb = [number, number, number];
type Oklab = [number, number, number];

interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const embeddedChartResultCache = new WeakMap<File, Promise<ProcessResult | null>>();
const rasterCache = new WeakMap<File, Promise<RasterImage>>();
const croppedRasterCache = new WeakMap<RasterImage, Map<string, RasterImage>>();
const autoDetectionCache = new WeakMap<RasterImage, Promise<WasmAutoDetection | null>>();
const logicalGridCache = new WeakMap<RasterImage, Map<string, RasterImage>>();

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
  gridMode: "auto" | "manual";
  gridWidth?: number;
  gridHeight?: number;
  cropRect?: NormalizedCropRect | null;
  reduceColors: boolean;
  applyAutoReduceColorsDefault?: boolean;
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
  source?: "detected" | "manual" | null;
}

export interface PaletteOption {
  label: string;
  hex: string;
}

export interface ProcessResult {
  blob: Blob;
  fileName: string;
  colorSystemId: string;
  detectionMode: string;
  effectiveReduceColors: boolean;
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

interface EmbeddedChartMetadata {
  version: number;
  app: string;
  colorSystemId: string;
  fileName: string;
  gridWidth: number;
  gridHeight: number;
  preferredEditorMode: "edit" | "pindou";
  cells: Array<[string, 1 | 0] | null>;
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
  build: () => RasterImage,
) {
  let cache = logicalGridCache.get(source);
  if (!cache) {
    cache = new Map<string, RasterImage>();
    logicalGridCache.set(source, cache);
  }

  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const logical = build();
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

  const paletteDefinition = getPaletteDefinition(options.colorSystemId);
  const loadedSource = await getCachedFileRaster(file, processMessages.canvasContextUnavailable);
  const source = getCachedCropRaster(loadedSource, options.cropRect);
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

    logical = getCachedLogicalGrid(
      source,
      `auto:${wasmDetection.kind}:${wasmDetection.cropBox.join(",")}:${wasmDetection.gridWidth}:${wasmDetection.gridHeight}`,
      () => sampleRegularGrid(
        cropRaster(source, wasmDetection.cropBox),
        wasmDetection.gridWidth,
        wasmDetection.gridHeight,
        wasmDetection.kind === "chart" ? "chart-edge" : "patch",
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

    gridWidth = options.gridWidth;
    gridHeight = options.gridHeight;
    logical = getCachedLogicalGrid(
      source,
      `manual:${gridWidth}:${gridHeight}:${options.preSharpen ? 1 : 0}:${options.preSharpenStrength}`,
      () => convertImageToLogicalGrid(
        source,
        gridWidth,
        gridHeight,
        options.preSharpen,
        options.preSharpenStrength,
      ),
    );
    detectionMode = "converted-from-image";
  }

  const effectiveReduceColors =
    options.applyAutoReduceColorsDefault &&
    options.gridMode === "auto" &&
    detectionMode === "detected-wasm-pixel" &&
    gridWidth < 30 &&
    gridHeight < 30
      ? false
      : options.reduceColors;

  const originalUniqueColors = countUniqueColors(logical.data);
  let reducedUniqueColors = originalUniqueColors;
  if (effectiveReduceColors) {
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
    processMessages.encodingFailed,
  );

  return {
    blob,
    fileName: defaultOutputName(file.name, gridWidth, gridHeight),
    colorSystemId: paletteDefinition.id,
    detectionMode,
    effectiveReduceColors,
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
  const blob = await buildChartBlobWithMetadata(
    canvas,
    {
      cells: normalizedCells,
      colorSystemId: paletteDefinition.id,
      fileName: options.fileName,
      gridWidth: options.gridWidth,
      gridHeight: options.gridHeight,
      preferredEditorMode: "pindou",
    },
    processMessages.encodingFailed,
  );
  return {
    blob,
    fileName: options.fileName,
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
  },
  encodingFailedMessage: string,
) {
  const baseBlob = await canvasToBlob(canvas, encodingFailedMessage);
  const metadata = buildEmbeddedChartMetadata(metadataInput);
  return embedChartMetadataInPngBlob(baseBlob, metadata);
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
  return {
    blob: file,
    fileName: metadata.fileName || defaultOutputName(file.name, metadata.gridWidth, metadata.gridHeight),
    colorSystemId: paletteDefinition.id,
    detectionMode: "embedded-chart-metadata",
    effectiveReduceColors: true,
    preferredEditorMode: metadata.preferredEditorMode ?? "pindou",
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
}): EmbeddedChartMetadata {
  return {
    version: CHART_METADATA_VERSION,
    app: CHART_METADATA_APP,
    colorSystemId: input.colorSystemId,
    fileName: input.fileName,
    gridWidth: input.gridWidth,
    gridHeight: input.gridHeight,
    preferredEditorMode: input.preferredEditorMode,
    cells: input.cells.map((cell) => {
      const normalized = normalizeEditableCell(cell);
      if (!normalized.label) {
        return null;
      }
      return [normalized.label, normalized.source === "manual" ? 1 : 0];
    }),
  };
}

async function embedChartMetadataInPngBlob(blob: Blob, metadata: EmbeddedChartMetadata) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const payload = injectPngITXtChunk(
    bytes,
    CHART_METADATA_KEYWORD,
    JSON.stringify(metadata),
  );
  const blobBytes = Uint8Array.from(payload);
  return new Blob([blobBytes], { type: "image/png" });
}

async function readEmbeddedChartMetadataFromFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = extractPngITXtChunk(bytes, CHART_METADATA_KEYWORD);
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as EmbeddedChartMetadata;
    if (
      parsed?.app !== CHART_METADATA_APP ||
      parsed?.version !== CHART_METADATA_VERSION ||
      !Array.isArray(parsed.cells) ||
      typeof parsed.colorSystemId !== "string" ||
      typeof parsed.fileName !== "string" ||
      typeof parsed.gridWidth !== "number" ||
      typeof parsed.gridHeight !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isPngLikeFile(file: File) {
  return file.type === "image/png" || /\.png$/i.test(file.name);
}

function injectPngITXtChunk(bytes: Uint8Array, keyword: string, text: string) {
  if (!hasPngSignature(bytes)) {
    return bytes;
  }

  const keywordBytes = encoder.encode(keyword);
  const textBytes = encoder.encode(text);
  const chunkData = new Uint8Array(keywordBytes.length + 5 + textBytes.length);
  chunkData.set(keywordBytes, 0);
  chunkData[keywordBytes.length] = 0;
  chunkData[keywordBytes.length + 1] = 0;
  chunkData[keywordBytes.length + 2] = 0;
  chunkData[keywordBytes.length + 3] = 0;
  chunkData[keywordBytes.length + 4] = 0;
  chunkData.set(textBytes, keywordBytes.length + 5);

  const chunk = buildPngChunk(PNG_ITXT_CHUNK, chunkData);
  const ihdrChunkEnd = findPngChunkEnd(bytes, PNG_IHDR_CHUNK);
  if (ihdrChunkEnd === null) {
    return bytes;
  }

  const payload = new Uint8Array(bytes.length + chunk.length);
  payload.set(bytes.slice(0, ihdrChunkEnd), 0);
  payload.set(chunk, ihdrChunkEnd);
  payload.set(bytes.slice(ihdrChunkEnd), ihdrChunkEnd + chunk.length);
  return payload;
}

function extractPngITXtChunk(bytes: Uint8Array, keyword: string) {
  if (!hasPngSignature(bytes)) {
    return null;
  }

  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = decoder.decode(bytes.slice(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      return null;
    }

    if (type === PNG_ITXT_CHUNK) {
      const keywordEnd = bytes.indexOf(0, dataStart);
      if (keywordEnd >= dataStart && keywordEnd < dataEnd) {
        const foundKeyword = decoder.decode(bytes.slice(dataStart, keywordEnd));
        if (foundKeyword === keyword) {
          const textStart = keywordEnd + 5;
          if (textStart <= dataEnd) {
            return decoder.decode(bytes.slice(textStart, dataEnd));
          }
        }
      }
    }

    offset = dataEnd + 4;
  }

  return null;
}

function buildPngChunk(type: string, data: Uint8Array) {
  const typeBytes = encoder.encode(type);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  writeUint32(chunk, 8 + data.length, crc32(concatUint8Arrays(typeBytes, data)));
  return chunk;
}

function findPngChunkEnd(bytes: Uint8Array, chunkType: string) {
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = decoder.decode(bytes.slice(offset + 4, offset + 8));
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) {
      return null;
    }
    if (type === chunkType) {
      return chunkEnd;
    }
    offset = chunkEnd;
  }
  return null;
}

function hasPngSignature(bytes: Uint8Array) {
  if (bytes.length < PNG_SIGNATURE.length) {
    return false;
  }
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      return false;
    }
  }
  return true;
}

function concatUint8Arrays(left: Uint8Array, right: Uint8Array) {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left, 0);
  combined.set(right, left.length);
  return combined;
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const crc32Table = buildCrc32Table();

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function defaultOutputName(fileName: string, gridWidth: number, gridHeight: number) {
  const dotIndex = fileName.lastIndexOf(".");
  const stem = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;
  void gridWidth;
  void gridHeight;
  return `【拼豆豆】${stem}.png`;
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

function representativeColorFromChartPatch(
  image: RasterImage,
  left: number,
  top: number,
  right: number,
  bottom: number,
): Rgb {
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
        const pixel = getPixel(image, x, y);
        sums[0] += pixel[0];
        sums[1] += pixel[1];
        sums[2] += pixel[2];
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
    return representativeColorFromPatch(image, left, top, right, bottom);
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
    return representativeColorFromPatch(image, left, top, right, bottom);
  }

  return [
    clampToByte(best.sum[0] / best.count),
    clampToByte(best.sum[1] / best.count),
    clampToByte(best.sum[2] / best.count),
  ];
}

function sampleRegularGrid(
  image: RasterImage,
  gridWidth: number,
  gridHeight: number,
  strategy: "patch" | "chart-edge" = "patch",
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
      const color =
        strategy === "chart-edge"
          ? representativeColorFromChartPatch(image, left, top, right, bottom)
          : representativeColorFromPatch(image, left, top, right, bottom);
      const index = (row * gridWidth + column) * 4;
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = 255;
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
): RasterImage {
  const pitch = cellSize + gap;
  const data = new Uint8ClampedArray(gridWidth * gridHeight * 4);

  for (let row = 0; row < gridHeight; row += 1) {
    const top = row * pitch;
    const bottom = Math.min(image.height, top + cellSize);
    for (let column = 0; column < gridWidth; column += 1) {
      const left = column * pitch;
      const right = Math.min(image.width, left + cellSize);
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
      source: "detected",
    }));
  }

  return { cells };
}

function reduceColorsPhotoshopStyle(image: RasterImage, tolerance: number) {
  const indexByColor = new Map<number, number>();
  const uniqueColors: Rgb[] = [];
  const counts: number[] = [];
  const pixelCount = image.width * image.height;
  const inverse = new Int32Array(pixelCount);

  for (let index = 0; index < pixelCount; index += 1) {
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

  const rareColorLimit = getRareColorPixelLimit(pixelCount);
  const oklabByColor = uniqueColors.map((color) => rgbToOklab(color));
  const replacementByColor = new Int32Array(originalUniqueColors);
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
    const replacement = uniqueColors[replacementByColor[inverse[index]]];
    const pixelIndex = index * 4;
    data[pixelIndex] = replacement[0];
    data[pixelIndex + 1] = replacement[1];
    data[pixelIndex + 2] = replacement[2];
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
    rareColorLimit,
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
  const axisGutter = Math.max(26, Math.floor(cellSize * 0.92));
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
  const metaRowHeight = metaLine ? metaFontSize + Math.max(12, Math.floor(cellSize * 0.24)) : 0;

  const legendTileWidth = Math.max(88, Math.floor(cellSize * 2.08));
  const legendSwatchHeight = Math.max(46, Math.floor(cellSize * 1.08));
  const legendTileHeight = legendSwatchHeight + Math.max(30, Math.floor(cellSize * 0.82));
  const legendGap = Math.max(10, Math.floor(cellSize / 4));

  const baseCanvasWidth = Math.max(boardBlockWidth + canvasPadding * 2, 900);
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
    boardBlockHeight +
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

  const boardBlockX = Math.floor((canvasWidth - boardBlockWidth) / 2);
  const boardBlockY =
    canvasPadding + brandRowHeight + titleGap + titleFontSize + metaRowHeight + titleGap;
  const boardOuterX = boardBlockX + axisGutter;
  const boardOuterY = boardBlockY + axisGutter;
  const boardInnerX = boardOuterX + frame;
  const boardInnerY = boardOuterY + frame;

  context.fillStyle = BOARD_FRAME_COLOR;
  context.fillRect(boardOuterX, boardOuterY, boardWidth + frame * 2, boardHeight + frame * 2);

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
    }
  }

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
      data[targetIndex + 3] = 255;
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

