interface WasmDetectorExports {
  memory: WebAssembly.Memory;
  alloc(size: number): number;
  dealloc(ptr: number, size: number): void;
  detect_auto(ptr: number, len: number, width: number, height: number): number;
  detect_chart(ptr: number, len: number, width: number, height: number): number;
  detect_pixel_art(ptr: number, len: number, width: number, height: number): number;
  enhance_edges(ptr: number, len: number, width: number, height: number, strength: number): number;
  detail_signal(
    ptr: number,
    len: number,
    width: number,
    height: number,
    gridWidth: number,
    gridHeight: number,
  ): number;
  result_ptr(): number;
  detail_result_ptr(): number;
  detail_result_len(): number;
}

interface RasterImageLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface WasmChartDetection {
  cropBox: [number, number, number, number];
  gridWidth: number;
  gridHeight: number;
  confidence: number;
}

export interface WasmPixelDetection {
  cropBox: [number, number, number, number];
  gridWidth: number;
  gridHeight: number;
  confidence: number;
}

export interface WasmAutoDetection {
  kind: "chart" | "pixel";
  cropBox: [number, number, number, number];
  gridWidth: number;
  gridHeight: number;
  confidence: number;
}

export interface WasmDetailSignal {
  protectedMask: Uint8Array;
  suggestedRgb: Array<[number, number, number] | null>;
  energy: Float32Array;
  contrast: Float32Array;
}

interface DetectorCacheStats {
  fftHits: number;
  fftMisses: number;
  detailHits: number;
  detailMisses: number;
}

const wasmUrl = new URL("../wasm/detecter.wasm", import.meta.url);
let detectorPromise: Promise<WasmDetectorExports | null> | null = null;
let detectorCallQueue: Promise<void> = Promise.resolve();
let fftEnhanceCache = new WeakMap<RasterImageLike, Map<string, Promise<RasterImageLike>>>();
let detailSignalCache = new WeakMap<RasterImageLike, Map<string, Promise<WasmDetailSignal | null>>>();
let detectorCacheStats: DetectorCacheStats = {
  fftHits: 0,
  fftMisses: 0,
  detailHits: 0,
  detailMisses: 0,
};

export function __debugGetDetectorCacheStats(): DetectorCacheStats {
  return { ...detectorCacheStats };
}

export function __debugResetDetectorCaches() {
  fftEnhanceCache = new WeakMap();
  detailSignalCache = new WeakMap();
  detectorCacheStats = {
    fftHits: 0,
    fftMisses: 0,
    detailHits: 0,
    detailMisses: 0,
  };
}

export async function detectChartBoardWithWasm(
  raster: RasterImageLike,
): Promise<WasmChartDetection | null> {
  const detection = await detectWithWasm(raster, "detect_chart");
  if (!detection) {
    return null;
  }

  return refineFullPageChartDetection(raster, detection);
}

export async function detectPixelArtWithWasm(
  raster: RasterImageLike,
): Promise<WasmPixelDetection | null> {
  return await detectWithWasm(raster, "detect_pixel_art");
}

export async function detectAutoRasterWithWasm(
  raster: RasterImageLike,
): Promise<WasmAutoDetection | null> {
  const autoCandidates = await detectAutoCandidatesWithWasm(raster);
  const chart = autoCandidates?.chart
    ? refineFullPageChartDetection(raster, autoCandidates.chart)
    : null;
  const rawPixel = autoCandidates?.pixel ?? null;
  const pixel = rawPixel
    ? expandPixelDetectionToGridCanvas(raster, rawPixel)
    : null;

  if (chart && rawPixel && pixel) {
    if (isLikelyFullCanvasGridPixelArt(raster, chart, rawPixel)) {
      return {
        kind: "pixel",
        cropBox: pixel.cropBox,
        gridWidth: pixel.gridWidth,
        gridHeight: pixel.gridHeight,
        confidence: pixel.confidence,
      };
    }

    if (isLikelyTrimmedFullPageChart(raster, chart, rawPixel)) {
      return {
        kind: "chart",
        cropBox: chart.cropBox,
        gridWidth: chart.gridWidth,
        gridHeight: chart.gridHeight,
        confidence: chart.confidence,
      };
    }

    if (isLikelyCoarseFullCanvasPixelFallback(raster, chart, rawPixel)) {
      return {
        kind: "chart",
        cropBox: chart.cropBox,
        gridWidth: chart.gridWidth,
        gridHeight: chart.gridHeight,
        confidence: chart.confidence,
      };
    }

    if (isLikelyPlainPixelArt(raster, chart, pixel)) {
      return {
        kind: "pixel",
        cropBox: pixel.cropBox,
        gridWidth: pixel.gridWidth,
        gridHeight: pixel.gridHeight,
        confidence: pixel.confidence,
      };
    }

    if (isLikelyPromotedPixelArtCandidate(raster, chart, rawPixel)) {
      const visualPixel = buildVisualContentPixelDetection(raster, rawPixel) ?? pixel;
      return {
        kind: "pixel",
        cropBox: visualPixel.cropBox,
        gridWidth: visualPixel.gridWidth,
        gridHeight: visualPixel.gridHeight,
        confidence: visualPixel.confidence,
      };
    }

    const chartScore = scoreAutoCandidate(raster, "chart", chart);
    const pixelScore = scoreAutoCandidate(raster, "pixel", rawPixel);
    return chartScore >= pixelScore
      ? {
          kind: "chart",
          cropBox: chart.cropBox,
          gridWidth: chart.gridWidth,
          gridHeight: chart.gridHeight,
          confidence: chart.confidence,
        }
      : {
          kind: "pixel",
          cropBox: pixel.cropBox,
          gridWidth: pixel.gridWidth,
          gridHeight: pixel.gridHeight,
          confidence: pixel.confidence,
        };
  }

  if (chart) {
    return {
      kind: "chart",
      cropBox: chart.cropBox,
      gridWidth: chart.gridWidth,
      gridHeight: chart.gridHeight,
      confidence: chart.confidence,
    };
  }

  if (!pixel) {
    return null;
  }

  return {
    kind: "pixel",
    cropBox: pixel.cropBox,
    gridWidth: pixel.gridWidth,
    gridHeight: pixel.gridHeight,
    confidence: pixel.confidence,
  };
}

export async function enhanceEdgesWithFftWasm(
  raster: RasterImageLike,
  strength: number,
): Promise<RasterImageLike> {
  const normalizedStrength = Math.max(0, Math.min(100, strength));
  if (normalizedStrength <= 0 || raster.width < 3 || raster.height < 3) {
    return {
      width: raster.width,
      height: raster.height,
      data: new Uint8ClampedArray(raster.data),
    };
  }

  return await getCachedDetectorResult(
    fftEnhanceCache,
    raster,
    `fft:${Math.round(normalizedStrength * 1000)}`,
    "fft",
    () =>
      runInDetectorQueue(async () => {
        const exports = await loadWasmDetector();
        if (!exports) {
          return {
            width: raster.width,
            height: raster.height,
            data: new Uint8ClampedArray(raster.data),
          };
        }

        const length = raster.data.length;
        const pointer = exports.alloc(length);
        try {
          const inputBuffer = new Uint8Array(exports.memory.buffer, pointer, length);
          inputBuffer.set(raster.data);
          const changed = exports.enhance_edges(
            pointer,
            length,
            raster.width,
            raster.height,
            Math.round(normalizedStrength * 1000),
          );
          const outputBuffer = new Uint8Array(exports.memory.buffer, pointer, length);
          return {
            width: raster.width,
            height: raster.height,
            data: changed
              ? new Uint8ClampedArray(outputBuffer)
              : new Uint8ClampedArray(raster.data),
          };
        } finally {
          exports.dealloc(pointer, length);
        }
      }),
  );
}

export function __debugExpandPixelDetectionToGridCanvas(
  raster: RasterImageLike,
  detection: WasmPixelDetection,
) {
  return expandPixelDetectionToGridCanvas(raster, detection);
}

export async function computeDetailSignalWithWasm(
  raster: RasterImageLike,
  gridWidth: number,
  gridHeight: number,
): Promise<WasmDetailSignal | null> {
  if (
    gridWidth <= 0 ||
    gridHeight <= 0 ||
    raster.width <= 0 ||
    raster.height <= 0 ||
    raster.data.length !== raster.width * raster.height * 4
  ) {
    return null;
  }

  return await getCachedDetectorResult(
    detailSignalCache,
    raster,
    `detail:${gridWidth}:${gridHeight}`,
    "detail",
    () =>
      runInDetectorQueue(async () => {
        const exports = await loadWasmDetector();
        if (!exports) {
          return null;
        }

        const length = raster.data.length;
        const pointer = exports.alloc(length);
        try {
          new Uint8Array(exports.memory.buffer, pointer, length).set(raster.data);
          const ok = exports.detail_signal(
            pointer,
            length,
            raster.width,
            raster.height,
            gridWidth,
            gridHeight,
          );
          if (!ok) {
            return null;
          }

          const resultPtr = exports.detail_result_ptr();
          const resultLen = exports.detail_result_len();
          if (!resultPtr || resultLen <= 1) {
            return null;
          }

          const raw = new Int32Array(exports.memory.buffer, resultPtr, resultLen);
          const cellCount = raw[0] ?? 0;
          if (cellCount !== gridWidth * gridHeight) {
            return null;
          }

          const protectedMask = new Uint8Array(cellCount);
          const suggestedRgb = Array.from(
            { length: cellCount },
            () => null as [number, number, number] | null,
          );
          const energy = new Float32Array(cellCount);
          const contrast = new Float32Array(cellCount);

          for (let index = 0; index < cellCount; index += 1) {
            const offset = 1 + index * 6;
            const isProtected = (raw[offset] ?? 0) > 0;
            const red = raw[offset + 3] ?? 0;
            const green = raw[offset + 4] ?? 0;
            const blue = raw[offset + 5] ?? 0;
            protectedMask[index] = Number(isProtected);
            energy[index] = (raw[offset + 1] ?? 0) / 1000;
            contrast[index] = (raw[offset + 2] ?? 0) / 1000;
            suggestedRgb[index] = isProtected ? [red, green, blue] : null;
          }

          return {
            protectedMask,
            suggestedRgb,
            energy,
            contrast,
          };
        } finally {
          exports.dealloc(pointer, length);
        }
      }),
  );
}

async function detectAutoCandidatesWithWasm(
  raster: RasterImageLike,
): Promise<{ chart: WasmChartDetection | null; pixel: WasmPixelDetection | null } | null> {
  return await runInDetectorQueue(async () => {
    const exports = await loadWasmDetector();
    if (!exports) {
      return null;
    }

    const length = raster.data.length;
    const pointer = exports.alloc(length);
    try {
      new Uint8Array(exports.memory.buffer, pointer, length).set(raster.data);
      exports.detect_auto(pointer, length, raster.width, raster.height);
      const result = new Int32Array(exports.memory.buffer, exports.result_ptr(), 16);
      return {
        chart: parseDetectionResult(result, 0),
        pixel: parseDetectionResult(result, 8),
      };
    } finally {
      exports.dealloc(pointer, length);
    }
  });
}

function getCachedDetectorResult<T>(
  cacheRoot: WeakMap<RasterImageLike, Map<string, Promise<T>>>,
  raster: RasterImageLike,
  key: string,
  kind: "fft" | "detail",
  build: () => Promise<T>,
) {
  let cache = cacheRoot.get(raster);
  if (!cache) {
    cache = new Map<string, Promise<T>>();
    cacheRoot.set(raster, cache);
  }

  const existing = cache.get(key);
  if (existing) {
    if (kind === "fft") {
      detectorCacheStats.fftHits += 1;
    } else {
      detectorCacheStats.detailHits += 1;
    }
    return existing;
  }

  if (kind === "fft") {
    detectorCacheStats.fftMisses += 1;
  } else {
    detectorCacheStats.detailMisses += 1;
  }

  const result = build().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, result);
  return result;
}

async function detectWithWasm(
  raster: RasterImageLike,
  methodName: "detect_chart" | "detect_pixel_art",
) {
  return await runInDetectorQueue(async () => {
    const exports = await loadWasmDetector();
    if (!exports) {
      return null;
    }

    const length = raster.data.length;
    const pointer = exports.alloc(length);
    try {
      new Uint8Array(exports.memory.buffer, pointer, length).set(raster.data);
      const found = exports[methodName](pointer, length, raster.width, raster.height);
      if (!found) {
        return null;
      }

      const result = new Int32Array(exports.memory.buffer, exports.result_ptr(), 16);
      return parseDetectionResult(result, 0);
    } finally {
      exports.dealloc(pointer, length);
    }
  });
}

function parseDetectionResult(
  result: Int32Array,
  offset: number,
): WasmChartDetection | WasmPixelDetection | null {
  if (result[offset] !== 1) {
    return null;
  }

  const left = result[offset + 1] ?? 0;
  const top = result[offset + 2] ?? 0;
  const right = result[offset + 3] ?? 0;
  const bottom = result[offset + 4] ?? 0;
  const gridWidth = result[offset + 5] ?? 0;
  const gridHeight = result[offset + 6] ?? 0;
  const confidence = (result[offset + 7] ?? 0) / 1000;
  if (
    left < 0 ||
    top < 0 ||
    right <= left ||
    bottom <= top ||
    gridWidth <= 0 ||
    gridHeight <= 0 ||
    confidence <= 0
  ) {
    return null;
  }

  return {
    cropBox: [left, top, right, bottom] as [number, number, number, number],
    gridWidth,
    gridHeight,
    confidence,
  };
}

async function loadWasmDetector(): Promise<WasmDetectorExports | null> {
  if (!detectorPromise) {
    detectorPromise = instantiateWasmDetector();
  }
  return detectorPromise;
}

async function instantiateWasmDetector(): Promise<WasmDetectorExports | null> {
  try {
    const bytes = await loadWasmBytes();
    const module = await WebAssembly.instantiate(bytes, {});
    return module.instance.exports as unknown as WasmDetectorExports;
  } catch {
    return null;
  }
}

async function runInDetectorQueue<T>(task: () => Promise<T>) {
  const previous = detectorCallQueue;
  let release!: () => void;
  detectorCallQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

async function loadWasmBytes() {
  const bunRuntime =
    typeof globalThis === "object" && "Bun" in globalThis
      ? ((globalThis as { Bun?: { file(url: string | URL): { arrayBuffer(): Promise<ArrayBuffer> } } }).Bun ?? null)
      : null;

  if (bunRuntime && wasmUrl.protocol === "file:") {
    return await bunRuntime.file(wasmUrl).arrayBuffer();
  }

  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`Failed to load detecter wasm: ${response.status}`);
  }
  return await response.arrayBuffer();
}

function scoreAutoCandidate(
  raster: RasterImageLike,
  kind: "chart" | "pixel",
  detection: WasmChartDetection | WasmPixelDetection,
) {
  const [left, top, right, bottom] = detection.cropBox;
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  const cropAreaRatio = (cropWidth * cropHeight) / Math.max(1, raster.width * raster.height);
  const cellSize = Math.min(
    cropWidth / Math.max(1, detection.gridWidth),
    cropHeight / Math.max(1, detection.gridHeight),
  );
  const cropAspect = cropWidth / Math.max(1, cropHeight);
  const gridAspect = detection.gridWidth / Math.max(1, detection.gridHeight);
  const aspectPenalty = Math.abs(Math.log(Math.max(cropAspect, 1e-3) / Math.max(gridAspect, 1e-3)));
  const outside = measureOutsideContentProfile(raster, detection.cropBox);
  const outsideContentRatio = outside.total;
  const marginRatio =
    ((left + raster.width - right) / Math.max(1, raster.width) +
      (top + raster.height - bottom) / Math.max(1, raster.height)) *
    0.5;
  const centeredMarginScore = measureCenteredMarginScore(raster, detection.cropBox);
  const coordinateBandBonus =
    Math.max(0, 0.12 - Math.max(outside.top, outside.left, outside.right)) * 6.5;

  if (kind === "chart") {
    return (
      detection.confidence * 5.5 +
      outsideContentRatio * 1.8 +
      marginRatio * 1.2 +
      centeredMarginScore * 0.8 -
      (1 - centeredMarginScore) * 0.9 +
      coordinateBandBonus +
      cropAreaRatio * 0.25 +
      Math.min(cellSize, 48) * 0.02 -
      aspectPenalty * 0.7
    );
  }

  return (
    detection.confidence * 5.5 -
    outsideContentRatio * 2.3 -
    marginRatio * 1.4 +
    coordinateBandBonus * 1.25 +
    cropAreaRatio * 0.45 +
    Math.min(cellSize, 48) * 0.03 -
    aspectPenalty * 0.5
  );
}

function isLikelyPromotedPixelArtCandidate(
  raster: RasterImageLike,
  chart: WasmChartDetection,
  pixel: WasmPixelDetection,
) {
  const sameCropOverlap = measureBoxOverlapRatio(chart.cropBox, pixel.cropBox);
  if (sameCropOverlap < 0.97) {
    return false;
  }

  if (
    Math.abs(chart.gridWidth - pixel.gridWidth) > 1 ||
    Math.abs(chart.gridHeight - pixel.gridHeight) > 1
  ) {
    return false;
  }

  if (chart.confidence > pixel.confidence + 0.06) {
    return false;
  }

  return (
    !hasCenteredMarginAxis(raster, chart.cropBox) ||
    countBoundaryFallbackSides(raster, chart.cropBox) >= 2
  );
}

function isLikelyFullCanvasGridPixelArt(
  raster: RasterImageLike,
  chart: WasmChartDetection,
  pixel: WasmPixelDetection,
) {
  if (countBoundaryFallbackSides(raster, pixel.cropBox) < 4) {
    return false;
  }

  if (pixel.confidence < chart.confidence + 0.04) {
    return false;
  }

  const chartArea =
    (chart.cropBox[2] - chart.cropBox[0]) * (chart.cropBox[3] - chart.cropBox[1]);
  const pixelArea =
    (pixel.cropBox[2] - pixel.cropBox[0]) * (pixel.cropBox[3] - pixel.cropBox[1]);
  return (
    pixelArea >= chartArea * 1.08 &&
    pixel.gridWidth >= chart.gridWidth &&
    pixel.gridHeight >= chart.gridHeight
  );
}

function buildVisualContentPixelDetection(
  raster: RasterImageLike,
  detection: WasmPixelDetection,
): WasmPixelDetection | null {
  const contentBox = findLargestBackgroundDifferentComponent(raster);
  if (!contentBox) {
    return null;
  }

  const [left, top, right, bottom] = contentBox;
  const width = right - left;
  const height = bottom - top;
  const cropWidth = detection.cropBox[2] - detection.cropBox[0];
  const cropHeight = detection.cropBox[3] - detection.cropBox[1];
  const cellWidth = cropWidth / Math.max(1, detection.gridWidth);
  const cellHeight = cropHeight / Math.max(1, detection.gridHeight);
  const gridWidth = Math.round(width / Math.max(1, cellWidth));
  const gridHeight = Math.round(height / Math.max(1, cellHeight));
  if (gridWidth < 4 || gridHeight < 4 || gridWidth > 102 || gridHeight > 102) {
    return null;
  }

  return {
    cropBox: contentBox,
    gridWidth,
    gridHeight,
    confidence: Math.min(0.99, detection.confidence + 0.02),
  };
}

function findLargestBackgroundDifferentComponent(
  raster: RasterImageLike,
): [number, number, number, number] | null {
  if (raster.width < 8 || raster.height < 8) {
    return null;
  }

  const background = estimateCornerBackgroundColor(raster);
  const threshold = 16;
  const pixelCount = raster.width * raster.height;
  const mask = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const dataIndex = index * 4;
    const alpha = raster.data[dataIndex + 3] ?? 255;
    if (alpha <= 16) {
      continue;
    }

    const delta = Math.max(
      Math.abs((raster.data[dataIndex] ?? 0) - background[0]),
      Math.abs((raster.data[dataIndex + 1] ?? 0) - background[1]),
      Math.abs((raster.data[dataIndex + 2] ?? 0) - background[2]),
    );
    if (delta > threshold) {
      mask[index] = 1;
    }
  }

  const seen = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let best: { left: number; top: number; right: number; bottom: number; count: number } | null =
    null;

  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const start = y * raster.width + x;
      if (mask[start] === 0 || seen[start] !== 0) {
        continue;
      }

      let head = 0;
      let tail = 0;
      let count = 0;
      let left = x;
      let top = y;
      let right = x + 1;
      let bottom = y + 1;
      seen[start] = 1;
      queue[tail] = start;
      tail += 1;

      while (head < tail) {
        const current = queue[head] ?? 0;
        head += 1;
        count += 1;
        const currentX = current % raster.width;
        const currentY = Math.floor(current / raster.width);
        left = Math.min(left, currentX);
        top = Math.min(top, currentY);
        right = Math.max(right, currentX + 1);
        bottom = Math.max(bottom, currentY + 1);

        const neighbors = [
          currentX > 0 ? current - 1 : -1,
          currentX + 1 < raster.width ? current + 1 : -1,
          currentY > 0 ? current - raster.width : -1,
          currentY + 1 < raster.height ? current + raster.width : -1,
        ];
        for (const neighbor of neighbors) {
          if (neighbor < 0 || mask[neighbor] === 0 || seen[neighbor] !== 0) {
            continue;
          }
          seen[neighbor] = 1;
          queue[tail] = neighbor;
          tail += 1;
        }
      }

      if (!best || count > best.count) {
        best = { left, top, right, bottom, count };
      }
    }
  }

  if (!best || best.count < pixelCount / 200) {
    return null;
  }

  return [best.left, best.top, best.right, best.bottom];
}

function estimateCornerBackgroundColor(raster: RasterImageLike): [number, number, number] {
  const samples: Array<[number, number, number]> = [];
  const patchSize = Math.max(2, Math.min(8, Math.floor(Math.min(raster.width, raster.height) / 64)));
  const corners = [
    [0, 0],
    [raster.width - patchSize, 0],
    [0, raster.height - patchSize],
    [raster.width - patchSize, raster.height - patchSize],
  ];

  for (const [startX, startY] of corners) {
    for (let y = startY; y < startY + patchSize; y += 1) {
      for (let x = startX; x < startX + patchSize; x += 1) {
        const index = (y * raster.width + x) * 4;
        if ((raster.data[index + 3] ?? 255) <= 16) {
          continue;
        }
        samples.push([
          raster.data[index] ?? 0,
          raster.data[index + 1] ?? 0,
          raster.data[index + 2] ?? 0,
        ]);
      }
    }
  }

  if (samples.length === 0) {
    return [255, 255, 255];
  }

  return [0, 1, 2].map((channel) => {
    const values = samples.map((sample) => sample[channel] ?? 0).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] ?? 255;
  }) as [number, number, number];
}

function hasCenteredMarginAxis(
  raster: RasterImageLike,
  cropBox: [number, number, number, number],
) {
  return measureCenteredMarginScore(raster, cropBox) >= 0.55;
}

function measureCenteredMarginScore(
  raster: RasterImageLike,
  cropBox: [number, number, number, number],
) {
  const [left, top, right, bottom] = cropBox;
  const horizontal = marginSimilarity(left, raster.width - right);
  const vertical = marginSimilarity(top, raster.height - bottom);
  return Math.max(horizontal, vertical);
}

function marginSimilarity(first: number, second: number) {
  const total = Math.max(1, first + second);
  return 1 - Math.abs(first - second) / total;
}

function countBoundaryFallbackSides(
  raster: RasterImageLike,
  cropBox: [number, number, number, number],
) {
  const [left, top, right, bottom] = cropBox;
  return [
    left <= 1,
    top <= 1,
    raster.width - right <= 1,
    raster.height - bottom <= 1,
  ].filter(Boolean).length;
}

function measureBoxOverlapRatio(
  first: [number, number, number, number],
  second: [number, number, number, number],
) {
  const overlapLeft = Math.max(first[0], second[0]);
  const overlapTop = Math.max(first[1], second[1]);
  const overlapRight = Math.min(first[2], second[2]);
  const overlapBottom = Math.min(first[3], second[3]);
  const overlapWidth = Math.max(0, overlapRight - overlapLeft);
  const overlapHeight = Math.max(0, overlapBottom - overlapTop);
  const overlapArea = overlapWidth * overlapHeight;
  const firstArea = Math.max(1, (first[2] - first[0]) * (first[3] - first[1]));
  const secondArea = Math.max(1, (second[2] - second[0]) * (second[3] - second[1]));
  return overlapArea / Math.min(firstArea, secondArea);
}

function expandPixelDetectionToGridCanvas(
  raster: RasterImageLike,
  detection: WasmPixelDetection,
): WasmPixelDetection {
  const [left, top, right, bottom] = detection.cropBox;
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  const cropAreaRatio = (cropWidth * cropHeight) / Math.max(1, raster.width * raster.height);
  if (cropAreaRatio >= 0.92 || cropWidth <= 0 || cropHeight <= 0) {
    return detection;
  }

  const cellWidth = cropWidth / Math.max(1, detection.gridWidth);
  const cellHeight = cropHeight / Math.max(1, detection.gridHeight);
  const cellAspect = Math.max(
    cellWidth / Math.max(1e-6, cellHeight),
    cellHeight / Math.max(1e-6, cellWidth),
  );
  if (cellWidth < 3 || cellHeight < 3 || cellAspect > 1.28) {
    return detection;
  }

  const fullGridWidth = Math.round(raster.width / cellWidth);
  const fullGridHeight = Math.round(raster.height / cellHeight);
  if (
    fullGridWidth < detection.gridWidth ||
    fullGridHeight < detection.gridHeight ||
    fullGridWidth > 102 ||
    fullGridHeight > 102
  ) {
    return detection;
  }

  const fullCellWidth = raster.width / Math.max(1, fullGridWidth);
  const fullCellHeight = raster.height / Math.max(1, fullGridHeight);
  const fullCellAspect = Math.max(
    fullCellWidth / Math.max(1e-6, fullCellHeight),
    fullCellHeight / Math.max(1e-6, fullCellWidth),
  );
  const cropGridWidthError = Math.abs(cropWidth / fullCellWidth - detection.gridWidth);
  const cropGridHeightError = Math.abs(cropHeight / fullCellHeight - detection.gridHeight);
  if (fullCellAspect > 1.28 || cropGridWidthError > 1.35 || cropGridHeightError > 1.35) {
    return detection;
  }

  const luma = buildLuma(raster);
  const verticalStrength = estimateFullCanvasGridBoundaryStrength(
    luma,
    raster.width,
    raster.height,
    fullGridWidth,
    true,
  );
  const horizontalStrength = estimateFullCanvasGridBoundaryStrength(
    luma,
    raster.width,
    raster.height,
    fullGridHeight,
    false,
  );
  if (verticalStrength < 1.05 || horizontalStrength < 1.05) {
    return detection;
  }

  return {
    cropBox: [0, 0, raster.width, raster.height],
    gridWidth: fullGridWidth,
    gridHeight: fullGridHeight,
    confidence: Math.min(0.99, detection.confidence + 0.08),
  };
}

function estimateFullCanvasGridBoundaryStrength(
  luma: Float32Array,
  width: number,
  height: number,
  gridSteps: number,
  verticalLines: boolean,
) {
  if (gridSteps < 4) {
    return 0;
  }

  const span = verticalLines ? width : height;
  const lineStep = span / gridSteps;
  let boundaryTotal = 0;
  let boundaryCount = 0;
  let interiorTotal = 0;
  let interiorCount = 0;

  for (let index = 1; index < gridSteps; index += 1) {
    const boundary = index * lineStep;
    const interior = (index - 0.5) * lineStep;
    boundaryTotal += sampleFullCanvasAxisGradient(luma, width, height, boundary, verticalLines);
    interiorTotal += sampleFullCanvasAxisGradient(luma, width, height, interior, verticalLines);
    boundaryCount += 1;
    interiorCount += 1;
  }

  return boundaryTotal / Math.max(1, boundaryCount) / Math.max(0.001, interiorTotal / Math.max(1, interiorCount));
}

function sampleFullCanvasAxisGradient(
  luma: Float32Array,
  width: number,
  height: number,
  position: number,
  verticalLines: boolean,
) {
  if (verticalLines) {
    const x = clamp(Math.round(position), 1, width - 2);
    let total = 0;
    let count = 0;
    const stepY = Math.max(1, Math.floor(height / 160));
    for (let y = 1; y < height - 1; y += stepY) {
      const row = y * width;
      const center = luma[row + x] ?? 0;
      const neighborMean = ((luma[row + x - 1] ?? 0) + (luma[row + x + 1] ?? 0)) * 0.5;
      total += Math.abs(center - neighborMean);
      count += 1;
    }
    return total / Math.max(1, count);
  }

  const y = clamp(Math.round(position), 1, height - 2);
  let total = 0;
  let count = 0;
  const row = y * width;
  const stepX = Math.max(1, Math.floor(width / 160));
  for (let x = 1; x < width - 1; x += stepX) {
    const center = luma[row + x] ?? 0;
    const neighborMean = ((luma[row + x - width] ?? 0) + (luma[row + x + width] ?? 0)) * 0.5;
    total += Math.abs(center - neighborMean);
    count += 1;
  }
  return total / Math.max(1, count);
}

function isLikelyPlainPixelArt(
  raster: RasterImageLike,
  chart: WasmChartDetection,
  pixel: WasmPixelDetection,
) {
  const pixelAnchoredSides = [
    pixel.cropBox[0] <= 1,
    pixel.cropBox[1] <= 1,
    raster.width - pixel.cropBox[2] <= 1,
    raster.height - pixel.cropBox[3] <= 1,
  ].filter(Boolean).length;
  const chartArea =
    (chart.cropBox[2] - chart.cropBox[0]) * (chart.cropBox[3] - chart.cropBox[1]);
  const pixelArea =
    (pixel.cropBox[2] - pixel.cropBox[0]) * (pixel.cropBox[3] - pixel.cropBox[1]);

  return (
    pixelAnchoredSides >= 3 &&
    pixel.confidence >= chart.confidence + 0.03 &&
    pixelArea >= chartArea * 1.18 &&
    pixel.gridWidth >= chart.gridWidth &&
    pixel.gridHeight >= chart.gridHeight
  );
}

function isLikelyCoarseFullCanvasPixelFallback(
  raster: RasterImageLike,
  chart: WasmChartDetection,
  pixel: WasmPixelDetection,
) {
  if (countBoundaryFallbackSides(raster, pixel.cropBox) < 3) {
    return false;
  }

  const chartWidth = chart.cropBox[2] - chart.cropBox[0];
  const chartHeight = chart.cropBox[3] - chart.cropBox[1];
  const pixelWidth = pixel.cropBox[2] - pixel.cropBox[0];
  const pixelHeight = pixel.cropBox[3] - pixel.cropBox[1];
  const chartArea = chartWidth * chartHeight;
  const pixelArea = pixelWidth * pixelHeight;
  const chartAreaRatio = chartArea / Math.max(1, raster.width * raster.height);
  const chartCells = chart.gridWidth * chart.gridHeight;
  const pixelCells = pixel.gridWidth * pixel.gridHeight;

  return (
    chart.confidence >= pixel.confidence + 0.08 &&
    chart.gridWidth >= 24 &&
    chart.gridHeight >= 24 &&
    chartAreaRatio >= 0.45 &&
    pixelArea >= chartArea * 1.08 &&
    chartCells >= pixelCells * 4
  );
}

function isLikelyTrimmedFullPageChart(
  raster: RasterImageLike,
  chart: WasmChartDetection,
  pixel: WasmPixelDetection,
) {
  const pixelAnchoredSides = [
    pixel.cropBox[0] <= 1,
    pixel.cropBox[1] <= 1,
    raster.width - pixel.cropBox[2] <= 1,
    raster.height - pixel.cropBox[3] <= 1,
  ].filter(Boolean).length;
  if (pixelAnchoredSides < 3) {
    return false;
  }

  const chartCropWidth = chart.cropBox[2] - chart.cropBox[0];
  const chartCropHeight = chart.cropBox[3] - chart.cropBox[1];
  const cellWidth = chartCropWidth / Math.max(1, chart.gridWidth);
  const cellHeight = chartCropHeight / Math.max(1, chart.gridHeight);
  const trims = {
    left: chart.cropBox[0] / Math.max(1, cellWidth),
    top: chart.cropBox[1] / Math.max(1, cellHeight),
    right: (raster.width - chart.cropBox[2]) / Math.max(1, cellWidth),
    bottom: (raster.height - chart.cropBox[3]) / Math.max(1, cellHeight),
  };
  const trimmedSides = [trims.left, trims.top, trims.right].filter(
    (value) => value >= 0.4 && value <= 1.8,
  ).length;
  const chartLegendTrim = trims.bottom >= 3.0 && trims.bottom <= 14.0;
  return (
    trimmedSides >= 3 &&
    chartLegendTrim &&
    chart.gridWidth <= pixel.gridWidth &&
    chart.gridHeight <= pixel.gridHeight
  );
}

function refineFullPageChartDetection(
  raster: RasterImageLike,
  detection: WasmChartDetection,
): WasmChartDetection {
  return (
    expandChartCoordinateEmptyFrame(raster, detection) ??
    (shouldRefineFullPageChartDetection(raster, detection)
      ? trimTrailingFullPageChartBand(raster, detection)
      : null) ??
    detection
  );
}

function expandChartCoordinateEmptyFrame(
  raster: RasterImageLike,
  detection: WasmChartDetection,
): WasmChartDetection | null {
  if (
    detection.confidence < 0.78 ||
    detection.gridWidth < 30 ||
    detection.gridHeight < 20
  ) {
    return null;
  }

  const [left, top, right, bottom] = detection.cropBox;
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  if (cropWidth < raster.width * 0.9 || cropHeight < raster.height * 0.65) {
    return null;
  }

  const cellWidth = Math.max(1, Math.round(cropWidth / Math.max(1, detection.gridWidth)));
  const cellHeight = Math.max(1, Math.round(cropHeight / Math.max(1, detection.gridHeight)));
  if (left > cellWidth * 2 || raster.width - right > cellWidth * 2) {
    return null;
  }

  const rightBand = sampleBandMetrics(raster, {
    left: right,
    top,
    right: Math.min(raster.width, right + cellWidth),
    bottom,
  });
  if (rightBand.separatorRatio < 0.32 || rightBand.coloredRatio > 0.12) {
    return null;
  }

  const bottomBands = countTrailingChartEmptyBands(raster, detection);
  if (bottomBands < 3) {
    return null;
  }

  const nextGridWidth = detection.gridWidth + 1;
  const nextGridHeight = detection.gridHeight + bottomBands;
  if (nextGridWidth > 102 || nextGridHeight > 102) {
    return null;
  }

  const projectedCell = cropWidth / Math.max(1, nextGridWidth);
  const nextBottom = top + Math.round(projectedCell * nextGridHeight);
  const maxEmptyBottom = Math.min(raster.height, bottom + cellHeight * bottomBands);
  if (
    nextBottom <= bottom ||
    nextBottom > maxEmptyBottom ||
    raster.height - nextBottom < cellHeight
  ) {
    return null;
  }

  return {
    cropBox: [left, top, right, nextBottom],
    gridWidth: nextGridWidth,
    gridHeight: nextGridHeight,
    confidence: Math.max(detection.confidence, 0.95),
  };
}

function countTrailingChartEmptyBands(
  raster: RasterImageLike,
  detection: WasmChartDetection,
) {
  let current: WasmChartDetection = { ...detection };
  let count = 0;
  for (let index = 0; index < 6; index += 1) {
    const [left, top, right, bottom] = current.cropBox;
    const bandHeight = Math.max(
      1,
      Math.round((bottom - top) / Math.max(1, current.gridHeight)),
    );
    const metrics = sampleBandMetrics(raster, {
      left,
      top: bottom,
      right,
      bottom: Math.min(raster.height, bottom + bandHeight),
    });
    if (metrics.separatorRatio < 0.05 || metrics.coloredRatio > 0.18) {
      break;
    }

    current = {
      ...current,
      cropBox: [left, top, right, Math.min(raster.height, bottom + bandHeight)],
      gridHeight: current.gridHeight + 1,
    };
    count += 1;
  }
  return count;
}

function shouldRefineFullPageChartDetection(
  raster: RasterImageLike,
  detection: WasmChartDetection,
) {
  const cropWidth = detection.cropBox[2] - detection.cropBox[0];
  const cropHeight = detection.cropBox[3] - detection.cropBox[1];
  if (
    detection.confidence < 0.78 ||
    detection.confidence > 0.92 ||
    detection.gridWidth < 30 ||
    detection.gridHeight < 20
  ) {
    return false;
  }

  const widthRatio = cropWidth / Math.max(1, raster.width);
  const heightRatio = cropHeight / Math.max(1, raster.height);
  if (widthRatio < 0.94 || heightRatio < 0.72) {
    return false;
  }

  const cellHeight = cropHeight / Math.max(1, detection.gridHeight);
  const bottomTrimCells =
    (raster.height - detection.cropBox[3]) / Math.max(1, cellHeight);
  return bottomTrimCells >= 1.4 && bottomTrimCells <= 5.5;
}

function trimTrailingFullPageChartBand(
  raster: RasterImageLike,
  detection: WasmChartDetection,
): WasmChartDetection | null {
  if (detection.gridHeight <= 20) {
    return null;
  }

  const profiles = buildHorizontalBandProfiles(raster, detection);
  if (profiles.length !== detection.gridHeight) {
    return null;
  }
  const baseline = buildBandBaseline(profiles);
  if (!baseline) {
    return null;
  }

  const tail = profiles.at(-1);
  if (!tail) {
    return null;
  }

  const looksDecorative =
    bandSimilarity(tail, baseline) < 0.74 ||
    tail.separatorRatio > baseline.separatorRatio * 1.42 ||
    (tail.coloredRatio < baseline.coloredRatio * 0.22 &&
      tail.separatorRatio > baseline.separatorRatio * 1.12) ||
    (tail.separatorRatio < baseline.separatorRatio * 0.22 &&
      tail.coloredRatio > baseline.coloredRatio * 0.72);
  if (!looksDecorative) {
    return null;
  }

  const cellHeight = Math.max(
    1,
    Math.round((detection.cropBox[3] - detection.cropBox[1]) / Math.max(1, detection.gridHeight)),
  );
  const nextBottom = detection.cropBox[3] - cellHeight;
  if (nextBottom <= detection.cropBox[1] + 8) {
    return null;
  }

  return {
    ...detection,
    cropBox: [detection.cropBox[0], detection.cropBox[1], detection.cropBox[2], nextBottom],
    gridHeight: detection.gridHeight - 1,
  };
}

function buildHorizontalBandProfiles(
  raster: RasterImageLike,
  detection: WasmChartDetection,
) {
  const [left, top, right, bottom] = detection.cropBox;
  const bandSpan = Math.max(
    1,
    Math.round((bottom - top) / Math.max(1, detection.gridHeight)),
  );
  const luma = buildLuma(raster);
  return Array.from({ length: detection.gridHeight }, (_, index) => {
    const bandTop = top + bandSpan * index;
    const bandBottom =
      index + 1 >= detection.gridHeight ? bottom : Math.min(bottom, bandTop + bandSpan);
    const rect = { left, top: bandTop, right, bottom: bandBottom };
    const metrics = sampleBandMetrics(raster, rect);
    return {
      coloredRatio: metrics.coloredRatio,
      separatorRatio: metrics.separatorRatio,
      gridStrength: estimateRectBoundaryStrength(
        luma,
        raster.width,
        detection,
        rect,
        true,
      ),
    };
  });
}

function buildBandBaseline(
  profiles: Array<{ coloredRatio: number; separatorRatio: number; gridStrength: number }>,
) {
  if (profiles.length < 6) {
    return null;
  }

  const ranked = [...profiles].sort((left, right) => {
    const leftScore = left.gridStrength * 0.7 + left.separatorRatio * 0.3;
    const rightScore = right.gridStrength * 0.7 + right.separatorRatio * 0.3;
    return rightScore - leftScore;
  });
  const takeCount = Math.min(ranked.length, Math.max(4, Math.floor(ranked.length / 3)));
  const selected = ranked.slice(0, takeCount);
  const sum = selected.reduce(
    (accumulator, profile) => ({
      coloredRatio: accumulator.coloredRatio + profile.coloredRatio,
      separatorRatio: accumulator.separatorRatio + profile.separatorRatio,
      gridStrength: accumulator.gridStrength + profile.gridStrength,
    }),
    { coloredRatio: 0, separatorRatio: 0, gridStrength: 0 },
  );

  return {
    coloredRatio: sum.coloredRatio / takeCount,
    separatorRatio: sum.separatorRatio / takeCount,
    gridStrength: sum.gridStrength / takeCount,
  };
}

function bandSimilarity(
  profile: { coloredRatio: number; separatorRatio: number; gridStrength: number },
  baseline: { coloredRatio: number; separatorRatio: number; gridStrength: number },
) {
  return (
    normalizedBandSimilarity(profile.coloredRatio, baseline.coloredRatio) * 0.22 +
    normalizedBandSimilarity(profile.separatorRatio, baseline.separatorRatio) * 0.28 +
    normalizedBandSimilarity(profile.gridStrength, baseline.gridStrength) * 0.5
  );
}

function normalizedBandSimilarity(value: number, baseline: number) {
  const ratio = Math.min(8, Math.max(0.001, value / Math.max(0.001, baseline)));
  return 1 - Math.min(1, Math.abs(Math.log(ratio)) / 2.1);
}

function buildLuma(raster: RasterImageLike) {
  const output = new Float32Array(raster.width * raster.height);
  for (let index = 0; index < output.length; index += 1) {
    const offset = index * 4;
    const red = raster.data[offset] ?? 0;
    const green = raster.data[offset + 1] ?? 0;
    const blue = raster.data[offset + 2] ?? 0;
    output[index] = 0.299 * red + 0.587 * green + 0.114 * blue;
  }
  return output;
}

function sampleBandMetrics(
  raster: RasterImageLike,
  rect: { left: number; top: number; right: number; bottom: number },
) {
  let coloredHits = 0;
  let separatorHits = 0;
  let total = 0;

  for (let y = rect.top; y < rect.bottom; y += 1) {
    for (let x = rect.left; x < rect.right; x += 1) {
      const offset = (y * raster.width + x) * 4;
      const pixel = [
        raster.data[offset] ?? 0,
        raster.data[offset + 1] ?? 0,
        raster.data[offset + 2] ?? 0,
        raster.data[offset + 3] ?? 255,
      ] as const;
      if (isColoredContentPixel(pixel)) {
        coloredHits += 1;
      }
      if (isLightSeparatorPixel(pixel[0], pixel[1], pixel[2])) {
        separatorHits += 1;
      }
      total += 1;
    }
  }

  return {
    coloredRatio: coloredHits / Math.max(1, total),
    separatorRatio: separatorHits / Math.max(1, total),
  };
}

function estimateRectBoundaryStrength(
  luma: Float32Array,
  width: number,
  detection: WasmChartDetection,
  rect: { left: number; top: number; right: number; bottom: number },
  verticalLines: boolean,
) {
  if (rect.right <= rect.left + 2 || rect.bottom <= rect.top + 2) {
    return 0;
  }

  const cellSize = verticalLines
    ? (detection.cropBox[2] - detection.cropBox[0]) / Math.max(1, detection.gridWidth)
    : (detection.cropBox[3] - detection.cropBox[1]) / Math.max(1, detection.gridHeight);
  const steps = verticalLines ? detection.gridWidth : detection.gridHeight;
  let boundaryTotal = 0;
  let boundaryCount = 0;
  let interiorTotal = 0;
  let interiorCount = 0;

  for (let index = 1; index < steps; index += 1) {
    const boundary = verticalLines
      ? detection.cropBox[0] + index * cellSize
      : detection.cropBox[1] + index * cellSize;
    const interior = verticalLines
      ? detection.cropBox[0] + (index - 0.5) * cellSize
      : detection.cropBox[1] + (index - 0.5) * cellSize;
    boundaryTotal += sampleAxisGradientInRect(luma, width, rect, boundary, verticalLines);
    interiorTotal += sampleAxisGradientInRect(luma, width, rect, interior, verticalLines);
    boundaryCount += 1;
    interiorCount += 1;
  }

  const boundaryMean = boundaryTotal / Math.max(1, boundaryCount);
  const interiorMean = interiorTotal / Math.max(1, interiorCount);
  return boundaryMean / Math.max(0.001, interiorMean);
}

function sampleAxisGradientInRect(
  luma: Float32Array,
  width: number,
  rect: { left: number; top: number; right: number; bottom: number },
  position: number,
  verticalLines: boolean,
) {
  if (verticalLines) {
    const x = clamp(Math.round(position), rect.left + 1, rect.right - 2);
    let total = 0;
    let count = 0;
    for (let y = rect.top + 1; y < rect.bottom - 1; y += 1) {
      const row = y * width;
      total += Math.abs((luma[row + x + 1] ?? 0) - (luma[row + x - 1] ?? 0));
      count += 1;
    }
    return total / Math.max(1, count);
  }

  const y = clamp(Math.round(position), rect.top + 1, rect.bottom - 2);
  let total = 0;
  let count = 0;
  const row = y * width;
  for (let x = rect.left + 1; x < rect.right - 1; x += 1) {
    total += Math.abs((luma[row + x + width] ?? 0) - (luma[row + x - width] ?? 0));
    count += 1;
  }
  return total / Math.max(1, count);
}

function isColoredContentPixel(pixel: readonly [number, number, number, number]) {
  if (pixel[3] < 16) {
    return false;
  }

  const [red, green, blue] = pixel;
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  return luminance < 242 && chroma > 18;
}

function isLightSeparatorPixel(red: number, green: number, blue: number) {
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  return luminance >= 168 && luminance <= 244 && chroma <= 24;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function measureOutsideContentProfile(
  raster: RasterImageLike,
  cropBox: [number, number, number, number],
) {
  const [left, top, right, bottom] = cropBox;
  const regions = [
    { key: "top", left: 0, top: 0, right: raster.width, bottom: top },
    { key: "bottom", left: 0, top: bottom, right: raster.width, bottom: raster.height },
    { key: "left", left: 0, top, right: left, bottom },
    { key: "right", left: right, top, right: raster.width, bottom },
  ] as const;

  let totalMeaningful = 0;
  let totalSampled = 0;
  const perSide = { top: 0, bottom: 0, left: 0, right: 0 } as Record<
    "top" | "bottom" | "left" | "right",
    number
  >;

  for (const region of regions) {
    const regionWidth = Math.max(0, region.right - region.left);
    const regionHeight = Math.max(0, region.bottom - region.top);
    if (!regionWidth || !regionHeight) {
      continue;
    }

    const stepX = Math.max(1, Math.floor(regionWidth / 80));
    const stepY = Math.max(1, Math.floor(regionHeight / 80));
    let meaningful = 0;
    let sampled = 0;
    for (let y = region.top; y < region.bottom; y += stepY) {
      for (let x = region.left; x < region.right; x += stepX) {
        const index = (y * raster.width + x) * 4;
        const alpha = raster.data[index + 3] ?? 255;
        if (alpha < 16) {
          continue;
        }
        const red = raster.data[index] ?? 0;
        const green = raster.data[index + 1] ?? 0;
        const blue = raster.data[index + 2] ?? 0;
        const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
        if (luminance < 92 || (luminance < 232 && chroma > 18)) {
          meaningful += 1;
        }
        sampled += 1;
      }
    }

    perSide[region.key] = sampled ? meaningful / sampled : 0;
    totalMeaningful += meaningful;
    totalSampled += sampled;
  }

  return {
    ...perSide,
    total: totalSampled ? totalMeaningful / totalSampled : 0,
  };
}
