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
}

export interface WasmPixelDetection {
  cropBox: [number, number, number, number];
  gridWidth: number;
  gridHeight: number;
}

export interface WasmAutoDetection {
  kind: "chart" | "pixel";
  cropBox: [number, number, number, number];
  gridWidth: number;
  gridHeight: number;
}

const wasmUrl = new URL("./detecter.wasm", import.meta.url);
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
  if (chart) {
    return {
      kind: "chart",
      cropBox: chart.cropBox,
      gridWidth: chart.gridWidth,
      gridHeight: chart.gridHeight,
    };
  }

  const pixel = await detectPixelArtWithWasm(raster);
  if (!pixel) {
    return null;
  }

  return {
    kind: "pixel",
    cropBox: pixel.cropBox,
    gridWidth: pixel.gridWidth,
    gridHeight: pixel.gridHeight,
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

    const result = new Int32Array(exports.memory.buffer, exports.result_ptr(), 7);
    if (result[0] !== 1) {
      return null;
    }

    const left = result[1] ?? 0;
    const top = result[2] ?? 0;
    const right = result[3] ?? 0;
    const bottom = result[4] ?? 0;
    const gridWidth = result[5] ?? 0;
    const gridHeight = result[6] ?? 0;
    if (
      left < 0 ||
      top < 0 ||
      right <= left ||
      bottom <= top ||
      gridWidth <= 0 ||
      gridHeight <= 0
    ) {
      return null;
    }

    return {
      cropBox: [left, top, right, bottom] as [number, number, number, number],
      gridWidth,
      gridHeight,
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
