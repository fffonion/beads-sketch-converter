interface WasmDetectorExports {
  memory: WebAssembly.Memory;
  alloc(size: number): number;
  dealloc(ptr: number, size: number): void;
  detect_chart(ptr: number, len: number, width: number, height: number): number;
  detect_pixel_art(ptr: number, len: number, width: number, height: number): number;
  result_ptr(): number;
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

const wasmUrl = new URL("../wasm/detecter.wasm", import.meta.url);
let detectorPromise: Promise<WasmDetectorExports | null> | null = null;

export async function detectChartBoardWithWasm(
  raster: RasterImageLike,
): Promise<WasmChartDetection | null> {
  return await detectWithWasm(raster, "detect_chart");
}

export async function detectPixelArtWithWasm(
  raster: RasterImageLike,
): Promise<WasmPixelDetection | null> {
  return await detectWithWasm(raster, "detect_pixel_art");
}

export async function detectAutoRasterWithWasm(
  raster: RasterImageLike,
): Promise<WasmAutoDetection | null> {
  const chart = await detectChartBoardWithWasm(raster);
  const pixel = await detectPixelArtWithWasm(raster);

  if (chart && pixel) {
    if (isLikelyTrimmedFullPageChart(raster, chart, pixel)) {
      return {
        kind: "chart",
        cropBox: chart.cropBox,
        gridWidth: chart.gridWidth,
        gridHeight: chart.gridHeight,
        confidence: chart.confidence,
      };
    }

    const chartScore = scoreAutoCandidate(raster, "chart", chart);
    const pixelScore = scoreAutoCandidate(raster, "pixel", pixel);
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

async function detectWithWasm(
  raster: RasterImageLike,
  methodName: "detect_chart" | "detect_pixel_art",
) {
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

    const result = new Int32Array(exports.memory.buffer, exports.result_ptr(), 8);
    if (result[0] !== 1) {
      return null;
    }

    const left = result[1] ?? 0;
    const top = result[2] ?? 0;
    const right = result[3] ?? 0;
    const bottom = result[4] ?? 0;
    const gridWidth = result[5] ?? 0;
    const gridHeight = result[6] ?? 0;
    const confidence = (result[7] ?? 0) / 1000;
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
  } finally {
    exports.dealloc(pointer, length);
  }
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
  const coordinateBandBonus =
    Math.max(0, 0.12 - Math.max(outside.top, outside.left, outside.right)) * 6.5;

  if (kind === "chart") {
    return (
      detection.confidence * 5.5 +
      outsideContentRatio * 1.8 +
      marginRatio * 1.2 +
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
  const chartLegendTrim = trims.bottom >= 3.5 && trims.bottom <= 8.5;
  return (
    trimmedSides >= 2 &&
    chartLegendTrim &&
    chart.gridWidth <= pixel.gridWidth &&
    chart.gridHeight <= pixel.gridHeight
  );
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
