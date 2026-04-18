import { expect, test } from "bun:test";
import { basename, join } from "node:path";
import {
  deserializeChartPayload,
  serializeChartPayload,
} from "../src/lib/chart-serialization";
import {
  applyContrast,
  applySoftGrayscaleToneCurve,
  collapseOpenBackgroundAreas,
  convertRasterToGrayscale,
  debugAutoDetectRaster,
  debugDetectChartBoardWithWasmPrepared,
  debugMatchLogicalRasterToPalette,
  enhancePixelOutlineContinuity,
  easePixelOutlineThickness,
  findChartQrBoardPlacement,
  getChartCellGap,
  getChartSnsDisplayScale,
  getMinimumQrSizeForSnsReadable,
  getChartFrameWidth,
  getPaletteOptions,
  projectEdgeEnhanceStrength,
  representativeColorFromPatch,
  resolveResponsiveChartQrSize,
  reduceColorsPhotoshopStyle,
  shouldShowChartColorLabels,
  shouldShowChartHeaderDetails,
  processImageFile,
} from "../src/lib/chart-processor";
import { detectChartBoardWithWasm, enhanceEdgesWithFftWasm } from "../src/lib/detecter";

const fixtureDir = join(import.meta.dir, "fixtures");
const sampleImagePath = join(fixtureDir, "bangboo_4.jpeg");
const exportedChartImagePath = join(fixtureDir, "bangboo_2_10_chart.png");
const additionalChartImagePath = join(fixtureDir, "chart_eye_blind_5.jpeg");
const burgerChartImagePath = join(fixtureDir, "burger_chart.jpg");
const xiaodouniChartImagePath = join(fixtureDir, "xiaodouni_wrong_right_4.jpeg");
const sanduonieChartImagePath = join(fixtureDir, "sanduonie_puppet_chart.jpeg");
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_IHDR_CHUNK = "IHDR";
const PNG_ITXT_CHUNK = "iTXt";
const chartMetadataKeyword = "pindou-chart";

interface EmbeddedChartMetadata {
  version: number;
  app: string;
  colorSystemId: string;
  fileName?: string;
  gridWidth: number;
  gridHeight: number;
  preferredEditorMode: "edit" | "pindou";
  editingLocked?: boolean;
  chartTitle?: string;
  cells: Array<[string, 1 | 0] | null>;
}

function loadRasterWithPowerShell(imagePath: string) {
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

function buildSolidRaster(width: number, height: number, color: [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const pixelIndex = index * 4;
    data[pixelIndex] = color[0];
    data[pixelIndex + 1] = color[1];
    data[pixelIndex + 2] = color[2];
    data[pixelIndex + 3] = 255;
  }

  return { width, height, data };
}

function setRasterPixel(
  raster: { width: number; height: number; data: Uint8ClampedArray },
  x: number,
  y: number,
  color: [number, number, number],
) {
  const pixelIndex = (y * raster.width + x) * 4;
  raster.data[pixelIndex] = color[0];
  raster.data[pixelIndex + 1] = color[1];
  raster.data[pixelIndex + 2] = color[2];
  raster.data[pixelIndex + 3] = 255;
}

function setRasterPixelRgba(
  raster: { width: number; height: number; data: Uint8ClampedArray },
  x: number,
  y: number,
  color: [number, number, number],
  alpha: number,
) {
  const pixelIndex = (y * raster.width + x) * 4;
  raster.data[pixelIndex] = color[0];
  raster.data[pixelIndex + 1] = color[1];
  raster.data[pixelIndex + 2] = color[2];
  raster.data[pixelIndex + 3] = alpha;
}

function setRasterPixelAlpha(
  raster: { width: number; height: number; data: Uint8ClampedArray },
  x: number,
  y: number,
  alpha: number,
) {
  const pixelIndex = (y * raster.width + x) * 4;
  raster.data[pixelIndex + 3] = alpha;
}

function getRasterPixel(
  raster: { width: number; height: number; data: Uint8ClampedArray },
  x: number,
  y: number,
) {
  const pixelIndex = (y * raster.width + x) * 4;
  return [
    raster.data[pixelIndex]!,
    raster.data[pixelIndex + 1]!,
    raster.data[pixelIndex + 2]!,
  ] as [number, number, number];
}

function getRasterPixelAlpha(
  raster: { width: number; height: number; data: Uint8ClampedArray },
  x: number,
  y: number,
) {
  const pixelIndex = (y * raster.width + x) * 4;
  return raster.data[pixelIndex + 3]!;
}

function readUint32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset]! << 24) |
    (bytes[offset + 1]! << 16) |
    (bytes[offset + 2]! << 8) |
    bytes[offset + 3]!
  ) >>> 0;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function concatUint8Arrays(parts: Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let current = index;
    for (let bit = 0; bit < 8; bit += 1) {
      current = (current & 1) !== 0 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }
    table[index] = current >>> 0;
  }
  return table;
}

const crc32Table = buildCrc32Table();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crc32Table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildPngChunk(type: string, data: Uint8Array) {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  writeUint32(chunk, 8 + data.length, crc32(concatUint8Arrays([typeBytes, data])));
  return chunk;
}

function findPngChunkEnd(bytes: Uint8Array, type: string) {
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const chunkType = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (chunkType === type) {
      return end;
    }
    offset = end;
  }
  return null;
}

function injectChartMetadataChunk(bytes: Uint8Array, text: string) {
  const keywordBytes = new TextEncoder().encode(chartMetadataKeyword);
  const textBytes = new TextEncoder().encode(text);
  const chunkData = new Uint8Array(keywordBytes.length + 5 + textBytes.length);
  chunkData.set(keywordBytes, 0);
  chunkData[keywordBytes.length] = 0;
  chunkData[keywordBytes.length + 1] = 0;
  chunkData[keywordBytes.length + 2] = 0;
  chunkData[keywordBytes.length + 3] = 0;
  chunkData[keywordBytes.length + 4] = 0;
  chunkData.set(textBytes, keywordBytes.length + 5);

  const insertOffset = findPngChunkEnd(bytes, PNG_IHDR_CHUNK);
  if (insertOffset === null) {
    throw new Error("Failed to find IHDR chunk in PNG fixture.");
  }

  const chunk = buildPngChunk(PNG_ITXT_CHUNK, chunkData);
  return concatUint8Arrays([
    bytes.slice(0, insertOffset),
    chunk,
    bytes.slice(insertOffset),
  ]);
}

test("compact chart serialization should round-trip chart payloads", () => {
  const serialized = serializeChartPayload(
    {
      colorSystemId: "mard_221",
      gridWidth: 4,
      gridHeight: 3,
      preferredEditorMode: "edit",
      title: "Share Title",
      cells: [
        ["B21", 0],
        null,
        ["H7", 1],
        null,
        ["H19", 0],
        ["M2", 1],
        null,
        null,
        null,
        ["F9", 0],
        null,
        ["A1", 0],
      ],
    },
    {
      includeManualRuns: true,
      includePreferredEditorMode: true,
    },
  );

  expect(deserializeChartPayload(serialized)).toEqual({
    colorSystemId: "mard_221",
    gridWidth: 4,
    gridHeight: 3,
    preferredEditorMode: "edit",
    editingLocked: false,
    title: "Share Title",
    cells: [
      ["B21", 0],
      null,
      ["H7", 1],
      null,
      ["H19", 0],
      ["M2", 1],
      null,
      null,
      null,
      ["F9", 0],
      null,
      ["A1", 0],
    ],
  });
});

test("compact chart serialization should preserve editing lock", () => {
  const serialized = serializeChartPayload(
    {
      colorSystemId: "mard_221",
      gridWidth: 3,
      gridHeight: 2,
      editingLocked: true,
      cells: [
        ["B21", 0],
        null,
        ["H7", 1],
        ["H19", 0],
        null,
        ["M2", 1],
      ],
    },
    {
      includeManualRuns: true,
      includePreferredEditorMode: false,
    },
  );

  expect(deserializeChartPayload(serialized)).toEqual({
    colorSystemId: "mard_221",
    gridWidth: 3,
    gridHeight: 2,
    preferredEditorMode: "pindou",
    editingLocked: true,
    title: "",
    cells: [
      ["B21", 0],
      null,
      ["H7", 1],
      ["H19", 0],
      null,
      ["M2", 1],
    ],
  });
});

test("compact chart serialization should compress long empty spans", () => {
  const serialized = serializeChartPayload({
    colorSystemId: "mard_221",
    gridWidth: 12,
    gridHeight: 1,
    cells: Array.from({ length: 12 }, () => null),
  });

  expect(deserializeChartPayload(serialized)).toEqual({
    colorSystemId: "mard_221",
    gridWidth: 12,
    gridHeight: 1,
    preferredEditorMode: "edit",
    editingLocked: false,
    title: "",
    cells: Array.from({ length: 12 }, () => null),
  });
  expect(serialized.length).toBeLessThan(20);
});

test("compact chart serialization should encode less common colors with extended tokens", () => {
  const serialized = serializeChartPayload({
    colorSystemId: "mard_full",
    gridWidth: 5,
    gridHeight: 1,
    preferredEditorMode: "pindou",
    cells: [["A01", 0], ["P01", 0], null, ["P20", 1], ["A02", 0]],
  });

  expect(deserializeChartPayload(serialized)).toEqual({
    colorSystemId: "mard_full",
    gridWidth: 5,
    gridHeight: 1,
    preferredEditorMode: "pindou",
    editingLocked: false,
    title: "",
    cells: [["A01", 0], ["P01", 0], null, ["P20", 1], ["A02", 0]],
  });
});

test("compact chart serialization should deflate dense charts before base83 encoding", () => {
  const serialized = serializeChartPayload({
    colorSystemId: "mard_221",
    gridWidth: 52,
    gridHeight: 52,
    preferredEditorMode: "pindou",
    cells: Array.from({ length: 52 * 52 }, (_, index) => {
      const column = index % 52;
      const row = Math.floor(index / 52);
      const palette = ["A1", "B21", "H7", "H19", "M2", "F9"];
      return [palette[(row * 3 + column) % palette.length]!, 0] as [string, 0];
    }),
  });

  expect(deserializeChartPayload(serialized)).toEqual({
    colorSystemId: "mard_221",
    gridWidth: 52,
    gridHeight: 52,
    preferredEditorMode: "pindou",
    editingLocked: false,
    title: "",
    cells: Array.from({ length: 52 * 52 }, (_, index) => {
      const column = index % 52;
      const row = Math.floor(index / 52);
      const palette = ["A1", "B21", "H7", "H19", "M2", "F9"];
      return [palette[(row * 3 + column) % palette.length]!, 0] as [string, 0];
    }),
  });
  expect(serialized.length).toBeLessThan(800);
});

test("compact chart serialization should avoid oversized push calls for very large dense charts", () => {
  const width = 360;
  const height = 360;
  const palette = ["A1", "B21", "H7", "H19", "M2", "F9"] as const;
  const cells = Array.from({ length: width * height }, (_, index) => {
    return [palette[index % palette.length]!, 0] as [string, 0];
  });

  const originalPush = Array.prototype.push;
  Array.prototype.push = function patchedPush(...items: unknown[]) {
    if (items.length > 10_000) {
      throw new Error(`push received too many arguments: ${items.length}`);
    }
    return Reflect.apply(originalPush, this, items);
  };

  try {
    const serialized = serializeChartPayload({
      colorSystemId: "mard_221",
      gridWidth: width,
      gridHeight: height,
      preferredEditorMode: "pindou",
      cells,
    });
    const parsed = deserializeChartPayload(serialized);

    expect(parsed.gridWidth).toBe(width);
    expect(parsed.gridHeight).toBe(height);
    expect(parsed.cells.length).toBe(width * height);
    expect(parsed.cells[0]).toEqual(["A1", 0]);
    expect(parsed.cells.at(-1)).toEqual(["F9", 0]);
  } finally {
    Array.prototype.push = originalPush;
  }
});

test("chart export pixel-art mode should remove cell gaps", () => {
  expect(getChartCellGap(36, false)).toBe(2);
  expect(getChartCellGap(36, true)).toBe(0);
  expect(getChartCellGap(8, false)).toBe(1);
  expect(getChartFrameWidth(36, false)).toBe(5);
  expect(getChartFrameWidth(36, true)).toBe(0);
  expect(shouldShowChartHeaderDetails()).toBe(true);
  expect(shouldShowChartHeaderDetails(true)).toBe(false);
});

test("chart export should show color labels by default and allow hiding them", () => {
  expect(shouldShowChartColorLabels()).toBe(true);
  expect(shouldShowChartColorLabels(true)).toBe(true);
  expect(shouldShowChartColorLabels(false)).toBe(false);
});

test("photo color reduction should preserve thin similar-color edges", () => {
  const raster = buildSolidRaster(5, 5, [200, 200, 200]);
  setRasterPixel(raster, 1, 2, [186, 186, 186]);
  setRasterPixel(raster, 2, 2, [182, 182, 182]);
  setRasterPixel(raster, 3, 2, [188, 188, 188]);

  const legacy = reduceColorsPhotoshopStyle(raster, 20);
  const preserved = reduceColorsPhotoshopStyle(raster, 20, { preserveEdges: true });

  expect(getRasterPixel(legacy.image, 1, 2)).toEqual([200, 200, 200]);
  expect(getRasterPixel(legacy.image, 2, 2)).toEqual([200, 200, 200]);
  expect(getRasterPixel(legacy.image, 3, 2)).toEqual([200, 200, 200]);
  expect(getRasterPixel(preserved.image, 1, 2)).toEqual([186, 186, 186]);
  expect(getRasterPixel(preserved.image, 2, 2)).toEqual([182, 182, 182]);
  expect(getRasterPixel(preserved.image, 3, 2)).toEqual([188, 188, 188]);
});

test("patch sampling should prefer cohesive actual pixels over averaged halo tones", () => {
  const raster = buildSolidRaster(3, 3, [207, 207, 207]);
  setRasterPixel(raster, 1, 0, [200, 200, 200]);
  setRasterPixel(raster, 0, 1, [200, 200, 200]);
  setRasterPixel(raster, 1, 1, [200, 200, 200]);
  setRasterPixel(raster, 2, 1, [200, 200, 200]);
  setRasterPixel(raster, 1, 2, [200, 200, 200]);

  expect(representativeColorFromPatch(raster, 0, 0, 3, 3)).toEqual([200, 200, 200]);
});

test("patch sampling should ignore fully transparent pixels instead of black mattes", () => {
  const raster = buildSolidRaster(3, 3, [0, 0, 0]);
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      setRasterPixelAlpha(raster, x, y, 0);
    }
  }

  setRasterPixelRgba(raster, 1, 0, [196, 164, 120], 255);
  setRasterPixelRgba(raster, 0, 1, [196, 164, 120], 255);
  setRasterPixelRgba(raster, 1, 1, [196, 164, 120], 255);

  expect(representativeColorFromPatch(raster, 0, 0, 3, 3)).toEqual([196, 164, 120]);
});

test("photo color reduction should still merge isolated near-color noise when preserving edges", () => {
  const raster = buildSolidRaster(5, 5, [200, 200, 200]);
  setRasterPixel(raster, 2, 2, [188, 188, 188]);

  const preserved = reduceColorsPhotoshopStyle(raster, 20, { preserveEdges: true });

  expect(getRasterPixel(preserved.image, 2, 2)).toEqual([200, 200, 200]);
  expect(preserved.reducedUniqueColors).toBe(1);
});

test("photo color reduction should preserve transparent pixels", () => {
  const raster = buildSolidRaster(3, 1, [200, 200, 200]);
  setRasterPixelRgba(raster, 0, 0, [0, 0, 0], 0);
  setRasterPixel(raster, 1, 0, [188, 188, 188]);

  const reduced = reduceColorsPhotoshopStyle(raster, 20);

  expect(getRasterPixel(reduced.image, 0, 0)).toEqual([0, 0, 0]);
  expect(getRasterPixelAlpha(reduced.image, 0, 0)).toBe(0);
  expect(getRasterPixelAlpha(reduced.image, 1, 0)).toBe(255);
});

test("fft edge enhancement should strengthen a broken thin outline neighborhood", async () => {
  const raster = buildSolidRaster(21, 21, [220, 220, 220]);
  for (let y = 3; y <= 17; y += 1) {
    if (y === 10) {
      continue;
    }
    setRasterPixel(raster, 10, y, [28, 28, 28]);
  }

  const enhanced = await enhanceEdgesWithFftWasm(raster, 80);

  expect(getRasterPixel(enhanced, 10, 10)[0]).toBeLessThan(200);
  expect(getRasterPixel(enhanced, 9, 10)[0]).toBeGreaterThan(210);
  expect(getRasterPixel(enhanced, 11, 10)[0]).toBeGreaterThan(210);
});

test("fft edge enhancement should not widen a clean one-pixel stroke at high strength", async () => {
  const raster = buildSolidRaster(21, 21, [220, 220, 220]);
  for (let y = 3; y <= 17; y += 1) {
    setRasterPixel(raster, 10, y, [28, 28, 28]);
  }

  const enhanced = await enhanceEdgesWithFftWasm(raster, 100);

  expect(getRasterPixel(enhanced, 10, 10)[0]).toBeLessThan(60);
  expect(getRasterPixel(enhanced, 9, 10)[0]).toBeGreaterThan(210);
  expect(getRasterPixel(enhanced, 11, 10)[0]).toBeGreaterThan(210);
});

test("fft edge enhancement should favor the dominant dark edge color instead of bleeding nearby accent colors", async () => {
  const raster = buildSolidRaster(21, 21, [220, 220, 220]);
  for (let y = 3; y <= 17; y += 1) {
    if (y === 10) {
      continue;
    }
    setRasterPixel(raster, 10, y, [150, 20, 20]);
  }
  setRasterPixel(raster, 9, 9, [20, 20, 150]);
  setRasterPixel(raster, 11, 11, [20, 20, 150]);

  const enhanced = await enhanceEdgesWithFftWasm(raster, 100);
  const bridged = getRasterPixel(enhanced, 10, 10);

  expect(bridged[0]).toBeGreaterThan(bridged[2] + 50);
  expect(bridged[1]).toBeLessThan(140);
});

test("fft edge enhancement should stay subtle at very low continuous strength", async () => {
  const raster = buildSolidRaster(21, 21, [220, 220, 220]);
  for (let y = 3; y <= 17; y += 1) {
    if (y === 10) {
      continue;
    }
    setRasterPixel(raster, 10, y, [40, 40, 40]);
  }

  const enhanced = await enhanceEdgesWithFftWasm(raster, 0.0059049);
  let totalDiff = 0;
  let changedPixels = 0;

  for (let index = 0; index < raster.data.length; index += 4) {
    const diff =
      Math.abs(enhanced.data[index] - raster.data[index]) +
      Math.abs(enhanced.data[index + 1] - raster.data[index + 1]) +
      Math.abs(enhanced.data[index + 2] - raster.data[index + 2]);
    totalDiff += diff;
    if (diff > 0) {
      changedPixels += 1;
    }
  }

  expect(totalDiff).toBeLessThan(2000);
  expect(changedPixels).toBeLessThan(40);
});

test("pixel outline continuity should bridge a one-cell horizontal gap after palette matching", () => {
  const fill = { label: "FILL", hex: "#F7DDE4", source: "detected" as const };
  const outline = { label: "LINE", hex: "#5A525B", source: "detected" as const };
  const cells = Array.from({ length: 5 * 5 }, () => ({ ...fill }));
  cells[2 * 5 + 0] = { ...outline };
  cells[2 * 5 + 1] = { ...outline };
  cells[2 * 5 + 3] = { ...outline };
  cells[2 * 5 + 4] = { ...outline };

  const enhanced = enhancePixelOutlineContinuity(cells, 5, 5, 80);

  expect(enhanced[2 * 5 + 2]).toMatchObject(outline);
});

test("pixel outline continuity should bridge a one-cell diagonal gap after palette matching", () => {
  const fill = { label: "FILL", hex: "#F7DDE4", source: "detected" as const };
  const outline = { label: "LINE", hex: "#5A525B", source: "detected" as const };
  const cells = Array.from({ length: 5 * 5 }, () => ({ ...fill }));
  cells[0 * 5 + 0] = { ...outline };
  cells[1 * 5 + 1] = { ...outline };
  cells[3 * 5 + 3] = { ...outline };
  cells[4 * 5 + 4] = { ...outline };

  const enhanced = enhancePixelOutlineContinuity(cells, 5, 5, 80);

  expect(enhanced[2 * 5 + 2]).toMatchObject(outline);
});

test("pixel outline continuity should honor the override edge color", () => {
  const fill = { label: "FILL", hex: "#F7DDE4", source: "detected" as const };
  const outline = { label: "LINE", hex: "#5A525B", source: "detected" as const };
  const override = { label: "OVERRIDE", hex: "#111111", source: "detected" as const };
  const cells = Array.from({ length: 5 * 5 }, () => ({ ...fill }));
  cells[2 * 5 + 0] = { ...outline };
  cells[2 * 5 + 1] = { ...outline };
  cells[2 * 5 + 3] = { ...outline };
  cells[2 * 5 + 4] = { ...outline };

  const enhanced = enhancePixelOutlineContinuity(cells, 5, 5, 80, override);

  expect(enhanced[2 * 5 + 2]).toMatchObject(override);
});

test("pixel outline continuity should recolor detected edge seeds with the override color", () => {
  const fill = { label: "FILL", hex: "#F7DDE4", source: "detected" as const };
  const outline = { label: "LINE", hex: "#5A525B", source: "detected" as const };
  const override = { label: "OVERRIDE", hex: "#111111", source: "detected" as const };
  const cells = Array.from({ length: 5 * 5 }, () => ({ ...fill }));
  cells[2 * 5 + 1] = { ...outline };
  cells[2 * 5 + 2] = { ...outline };
  cells[2 * 5 + 3] = { ...outline };

  const enhanced = enhancePixelOutlineContinuity(cells, 5, 5, 80, override);

  expect(enhanced[2 * 5 + 1]).toMatchObject(override);
  expect(enhanced[2 * 5 + 2]).toMatchObject(override);
  expect(enhanced[2 * 5 + 3]).toMatchObject(override);
});

test("pixel outline continuity should not thicken a clean one-pixel outline", () => {
  const fill = { label: "FILL", hex: "#F7DDE4", source: "detected" as const };
  const outline = { label: "LINE", hex: "#5A525B", source: "detected" as const };
  const cells = Array.from({ length: 5 * 5 }, () => ({ ...fill }));
  cells[2 * 5 + 1] = { ...outline };
  cells[2 * 5 + 2] = { ...outline };
  cells[2 * 5 + 3] = { ...outline };

  const enhanced = enhancePixelOutlineContinuity(cells, 5, 5, 1);

  expect(enhanced[1 * 5 + 2]).toMatchObject(fill);
  expect(enhanced[3 * 5 + 2]).toMatchObject(fill);
  expect(enhanced[2 * 5 + 0]).toMatchObject(fill);
  expect(enhanced[2 * 5 + 4]).toMatchObject(fill);
});

test("pixel outline continuity should not thicken a clean one-pixel outline at high strength", () => {
  const fill = { label: "FILL", hex: "#F7DDE4", source: "detected" as const };
  const outline = { label: "LINE", hex: "#5A525B", source: "detected" as const };
  const cells = Array.from({ length: 5 * 5 }, () => ({ ...fill }));
  cells[2 * 5 + 1] = { ...outline };
  cells[2 * 5 + 2] = { ...outline };
  cells[2 * 5 + 3] = { ...outline };

  const enhanced = enhancePixelOutlineContinuity(cells, 5, 5, 80);

  expect(enhanced[1 * 5 + 2]).toMatchObject(fill);
  expect(enhanced[3 * 5 + 2]).toMatchObject(fill);
  expect(enhanced[2 * 5 + 0]).toMatchObject(fill);
  expect(enhanced[2 * 5 + 4]).toMatchObject(fill);
});

test("pixel outline continuity should preserve short whisker-like details without turning them into blocks", () => {
  const fill = { label: "FILL", hex: "#F7DDE4", source: "detected" as const };
  const outline = { label: "LINE", hex: "#5A525B", source: "detected" as const };
  const cells = Array.from({ length: 5 * 5 }, () => ({ ...fill }));
  cells[1 * 5 + 1] = { ...outline };
  cells[2 * 5 + 2] = { ...outline };
  cells[3 * 5 + 3] = { ...outline };

  const enhanced = enhancePixelOutlineContinuity(cells, 5, 5, 80);

  expect(enhanced[1 * 5 + 2]).toMatchObject(fill);
  expect(enhanced[2 * 5 + 1]).toMatchObject(fill);
  expect(enhanced[2 * 5 + 3]).toMatchObject(fill);
  expect(enhanced[3 * 5 + 2]).toMatchObject(fill);
});

test("pixel outline easing should leave cells unchanged at zero strength", () => {
  const fill = { label: "FILL", hex: "#F7DDE4", source: "detected" as const };
  const outline = { label: "LINE", hex: "#5A525B", source: "detected" as const };
  const cells = Array.from({ length: 5 * 5 }, () => ({ ...fill }));
  cells[2 * 5 + 1] = { ...outline };
  cells[2 * 5 + 2] = { ...outline };
  cells[2 * 5 + 3] = { ...outline };

  const eased = easePixelOutlineThickness(cells, 5, 5, 0);

  expect(eased).toEqual(cells);
});

test("edge enhance strength projection should keep positive values linear while preserving the negative easing curve", () => {
  expect(projectEdgeEnhanceStrength(0)).toBe(0);
  expect(projectEdgeEnhanceStrength(10)).toBeCloseTo(10, 8);
  expect(projectEdgeEnhanceStrength(20)).toBeCloseTo(20, 8);
  expect(projectEdgeEnhanceStrength(30)).toBeCloseTo(30, 8);
  expect(projectEdgeEnhanceStrength(40)).toBeCloseTo(40, 8);
  expect(projectEdgeEnhanceStrength(42)).toBeCloseTo(42, 8);
  expect(projectEdgeEnhanceStrength(43)).toBeCloseTo(43, 8);
  expect(projectEdgeEnhanceStrength(44)).toBeCloseTo(44, 8);
  expect(projectEdgeEnhanceStrength(50)).toBeCloseTo(50, 8);
  expect(projectEdgeEnhanceStrength(60)).toBeCloseTo(60, 8);
  expect(projectEdgeEnhanceStrength(80)).toBeCloseTo(80, 8);
  expect(projectEdgeEnhanceStrength(90)).toBeCloseTo(90, 8);
  expect(projectEdgeEnhanceStrength(100)).toBeCloseTo(100, 8);
  expect(projectEdgeEnhanceStrength(-9)).toBeCloseTo(-0.81, 6);
  expect(projectEdgeEnhanceStrength(-10)).toBeCloseTo(-1, 6);
  expect(projectEdgeEnhanceStrength(-50)).toBe(-25);
  expect(projectEdgeEnhanceStrength(-100)).toBe(-100);
});

test("pixel outline easing should thin a thick outline to a single-cell stroke and refill with neighboring color", () => {
  const fill = { label: "FILL", hex: "#F7DDE4", source: "detected" as const };
  const outline = { label: "LINE", hex: "#5A525B", source: "detected" as const };
  const cells = Array.from({ length: 7 * 7 }, () => ({ ...fill }));

  for (let y = 2; y <= 4; y += 1) {
    for (let x = 1; x <= 5; x += 1) {
      cells[y * 7 + x] = { ...outline };
    }
  }

  const eased = easePixelOutlineThickness(cells, 7, 7, 100);

  for (let x = 1; x <= 5; x += 1) {
    expect(eased[3 * 7 + x]).toMatchObject(outline);
    expect(eased[2 * 7 + x]).toMatchObject(fill);
    expect(eased[4 * 7 + x]).toMatchObject(fill);
  }
});

test("pixel outline easing should keep an intermediate thickness at medium strength", () => {
  const fill = { label: "FILL", hex: "#F7DDE4", source: "detected" as const };
  const outline = { label: "LINE", hex: "#5A525B", source: "detected" as const };
  const cells = Array.from({ length: 7 * 7 }, () => ({ ...fill }));

  for (let y = 2; y <= 4; y += 1) {
    for (let x = 1; x <= 5; x += 1) {
      cells[y * 7 + x] = { ...outline };
    }
  }

  const eased = easePixelOutlineThickness(cells, 7, 7, 50);

  for (let x = 1; x <= 5; x += 1) {
    const outlineCount =
      Number(eased[2 * 7 + x].label === outline.label) +
      Number(eased[3 * 7 + x].label === outline.label) +
      Number(eased[4 * 7 + x].label === outline.label);
    expect(outlineCount).toBe(2);
  }
});

test("background collapse should preserve a quasi-enclosed interior behind a one-cell mouth", () => {
  const background = { label: "H2", hex: "#FFFFFF", source: "detected" as const };
  const wall = { label: "H6", hex: "#222222", source: "detected" as const };
  const cells = Array.from({ length: 7 * 7 }, () => ({ ...background }));

  for (let x = 1; x <= 5; x += 1) {
    if (x !== 3) {
      cells[1 * 7 + x] = { ...wall };
    }
    cells[5 * 7 + x] = { ...wall };
  }
  for (let y = 1; y <= 5; y += 1) {
    cells[y * 7 + 1] = { ...wall };
    cells[y * 7 + 5] = { ...wall };
  }

  const collapsed = collapseOpenBackgroundAreas(cells, 7, 7);

  expect(collapsed[0]).toMatchObject({ label: null, hex: null });
  expect(collapsed[3 * 7 + 3]).toMatchObject(background);
  expect(collapsed[1 * 7 + 3]).toMatchObject(background);
});

test("background collapse should still remove interiors with a wide opening", () => {
  const background = { label: "H2", hex: "#FFFFFF", source: "detected" as const };
  const wall = { label: "H6", hex: "#222222", source: "detected" as const };
  const cells = Array.from({ length: 7 * 7 }, () => ({ ...background }));

  for (let x = 1; x <= 5; x += 1) {
    if (x < 2 || x > 4) {
      cells[1 * 7 + x] = { ...wall };
    }
    cells[5 * 7 + x] = { ...wall };
  }
  for (let y = 1; y <= 5; y += 1) {
    cells[y * 7 + 1] = { ...wall };
    cells[y * 7 + 5] = { ...wall };
  }

  const collapsed = collapseOpenBackgroundAreas(cells, 7, 7);

  expect(collapsed[3 * 7 + 3]).toMatchObject({ label: null, hex: null });
});

test("chart QR placement should use a large empty board region when available", () => {
  const cells = Array.from({ length: 16 * 16 }, () => ({
    label: "A1",
    hex: "#000000",
    source: "detected" as const,
  }));
  for (let row = 0; row < 10; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      cells[row * 16 + column] = { label: null, hex: null, source: null };
    }
  }

  const placement = findChartQrBoardPlacement(cells, 16, 16, 28, 220);
  expect(placement).not.toBeNull();
  expect(placement).toMatchObject({
    cellLeft: 0,
    cellTop: 0,
    cellSpan: 10,
  });
  expect(placement?.qrSize).toBeGreaterThanOrEqual(160);
  expect(placement?.cardWidth).toBe(placement?.qrSize ? placement.qrSize + placement.cardPadding * 2 : undefined);
  expect(placement?.cardWidth).toBeLessThan(placement ? placement.cellSpan * 28 : Number.POSITIVE_INFINITY);
});

test("chart QR placement should ignore empty regions that are not in board corners", () => {
  const filledCells = Array.from({ length: 16 * 16 }, () => ({
    label: "A1",
    hex: "#000000",
    source: "detected" as const,
  }));
  const middleEmptyCells = [...filledCells];
  for (let row = 4; row < 12; row += 1) {
    for (let column = 4; column < 12; column += 1) {
      middleEmptyCells[row * 16 + column] = { label: null, hex: null, source: null };
    }
  }

  expect(findChartQrBoardPlacement(filledCells, 16, 16, 28, 220)).toBeNull();
  expect(findChartQrBoardPlacement(middleEmptyCells, 16, 16, 28, 220)).toBeNull();
});

test("SNS QR sizing should upscale the code when the export image will be downscaled heavily", () => {
  expect(getChartSnsDisplayScale(2560, 2936)).toBeCloseTo(0.5, 2);
  expect(getMinimumQrSizeForSnsReadable(2560, 2936)).toBeGreaterThanOrEqual(384);
});

test("responsive below-board QR sizing should preserve readable size after SNS downscale", () => {
  const qrSize = resolveResponsiveChartQrSize({
    cellSize: 28,
    canvasPadding: 28,
    qrCardPadding: 24,
    qrCaptionBlockHeight: 28,
    qrSectionGap: 16,
    baseCanvasWidth: 2560,
    baseCanvasHeight: 2936,
  });

  const scaledCanvasWidth = Math.max(2560, Math.max(qrSize + 48, qrSize + 168) + 56);
  const scaledCanvasHeight = 2936 + 16 + (qrSize + 48 + 28);
  expect(qrSize).toBeGreaterThanOrEqual(384);
  expect(qrSize * getChartSnsDisplayScale(scaledCanvasWidth, scaledCanvasHeight)).toBeGreaterThanOrEqual(192);
});

test("auto detect should not crop bangboo _4 into a stripe", async () => {
  const raster = loadRasterWithPowerShell(sampleImagePath);
  const result = await debugAutoDetectRaster(raster, basename(sampleImagePath));

  expect(result.cropBox).not.toBeNull();
  expect(result.gridWidth).toBe(33);
  expect(result.gridHeight).toBe(34);

  const [left, top, right, bottom] = result.cropBox!;
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  const aspect = cropWidth / cropHeight;

  expect(aspect).toBeGreaterThan(0.75);
  expect(aspect).toBeLessThan(1.25);
  expect(cropWidth).toBeGreaterThan(raster.width * 0.7);
  expect(cropHeight).toBeGreaterThan(raster.height * 0.7);
});

test("auto detect should crop exported chart to the framed pixel board", async () => {
  const raster = loadRasterWithPowerShell(exportedChartImagePath);
  const result = await debugAutoDetectRaster(raster, basename(exportedChartImagePath));

  expect(result.mode).toBe("detected-wasm-chart");
  expect(result.gridWidth).toBeGreaterThan(30);
  expect(result.gridHeight).toBeGreaterThan(30);
  expect(result.cropBox).not.toBeNull();

  const [left, top, right, bottom] = result.cropBox!;
  const cropWidth = right - left;
  const cropHeight = bottom - top;

  expect(left).toBeGreaterThan(0);
  expect(top).toBeGreaterThan(0);
  expect(cropWidth).toBeLessThan(raster.width);
  expect(cropHeight).toBeLessThan(raster.height);
  expect(cropHeight).toBeGreaterThan(raster.height * 0.45);
});

test("rust chart detector should detect the framed board and grid size", async () => {
  const raster = loadRasterWithPowerShell(exportedChartImagePath);
  const result = await detectChartBoardWithWasm(raster);

  expect(result).not.toBeNull();
  expect(result?.gridWidth).toBe(38);
  expect(result?.gridHeight).toBe(39);

  const cropWidth = (result?.cropBox[2] ?? 0) - (result?.cropBox[0] ?? 0);
  const cropHeight = (result?.cropBox[3] ?? 0) - (result?.cropBox[1] ?? 0);
  expect(cropWidth).toBeGreaterThan(raster.width * 0.85);
  expect(cropHeight).toBeGreaterThan(raster.height * 0.8);
});

test("rust chart detector should detect large separator-board chart cell counts", async () => {
  const raster = loadRasterWithPowerShell(xiaodouniChartImagePath);
  const result = await detectChartBoardWithWasm(raster);

  expect(result).not.toBeNull();
  expect(result?.gridWidth).toBe(40);
  expect(result?.gridHeight).toBe(34);

  const cropWidth = (result?.cropBox[2] ?? 0) - (result?.cropBox[0] ?? 0);
  const cropHeight = (result?.cropBox[3] ?? 0) - (result?.cropBox[1] ?? 0);
  expect(cropWidth).toBeGreaterThan(raster.width * 0.9);
  expect(cropHeight).toBeGreaterThan(raster.height * 0.68);
});

test("rust chart detector should detect separator-board burger chart", async () => {
  const raster = loadRasterWithPowerShell(burgerChartImagePath);
  const result = await detectChartBoardWithWasm(raster);

  expect(result).not.toBeNull();
  expect(result?.gridWidth).toBe(52);
  expect(result?.gridHeight).toBe(40);

  const cropWidth = (result?.cropBox[2] ?? 0) - (result?.cropBox[0] ?? 0);
  const cropHeight = (result?.cropBox[3] ?? 0) - (result?.cropBox[1] ?? 0);
  expect(cropWidth).toBeGreaterThan(raster.width * 0.95);
  expect(cropHeight).toBeGreaterThan(raster.height * 0.8);
});

test("rust detector guide refinement should fix sanduonie chart crop and grid", async () => {
  const raster = loadRasterWithPowerShell(sanduonieChartImagePath);
  const result = await debugDetectChartBoardWithWasmPrepared(raster);

  expect(result).not.toBeNull();
  expect(result?.built).not.toBeNull();
  expect(result?.built?.gridWidth).toBe(45);
  expect(result?.built?.gridHeight).toBe(51);
  expect(result?.built?.cropBox).not.toBeNull();
  const [left, top, right, bottom] = result!.built!.cropBox;
  expect(left).toBeGreaterThanOrEqual(95);
  expect(left).toBeLessThanOrEqual(105);
  expect(top).toBe(497);
  expect(right).toBeGreaterThanOrEqual(2348);
  expect(right).toBeLessThanOrEqual(2350);
  expect(bottom).toBeGreaterThanOrEqual(2995);
  expect(bottom).toBeLessThanOrEqual(2996);
});

test("auto detect should import chart_eye_blind_5 as a chart", async () => {
  const raster = loadRasterWithPowerShell(additionalChartImagePath);
  const result = await debugAutoDetectRaster(raster, basename(additionalChartImagePath));

  expect(result.cropBox).not.toBeNull();
  expect(result.preferredEditorMode).toBe("pindou");
  expect(result.gridWidth).toBe(37);
  expect(result.gridHeight).toBe(31);
}, 120_000);

test("auto detect should import burger chart as a separator-board chart", async () => {
  const raster = loadRasterWithPowerShell(burgerChartImagePath);
  const result = await debugAutoDetectRaster(raster, basename(burgerChartImagePath));

  expect(result.cropBox).not.toBeNull();
  expect(result.preferredEditorMode).toBe("pindou");
  expect(result.gridWidth).toBe(52);
  expect(result.gridHeight).toBe(40);

  const [left, top, right, bottom] = result.cropBox!;
  const cropWidth = right - left;
  const cropHeight = bottom - top;

  expect(cropWidth).toBeGreaterThan(raster.width * 0.85);
  expect(cropHeight).toBeGreaterThan(raster.height * 0.8);
}, 120_000);

test("embedded chart metadata should import directly without raster parsing", async () => {
  const basePngBytes = new Uint8Array(await Bun.file(exportedChartImagePath).arrayBuffer());
  expect(basePngBytes.slice(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);

  const metadata: EmbeddedChartMetadata = {
    version: 5,
    app: "pindou",
    colorSystemId: "mard_221",
    fileName: "【拼豆豆】embedded-test.png",
    gridWidth: 3,
    gridHeight: 2,
    preferredEditorMode: "pindou",
    editingLocked: true,
    chartTitle: "Embedded Title",
    cells: [
      ["B21", 0],
      ["H7", 1],
      null,
      ["H19", 0],
      ["M2", 1],
      ["F9", 0],
    ],
  };
  const file = new File(
    [
      injectChartMetadataChunk(
        basePngBytes,
        serializeChartPayload(
          {
            colorSystemId: metadata.colorSystemId,
            gridWidth: metadata.gridWidth,
            gridHeight: metadata.gridHeight,
            preferredEditorMode: metadata.preferredEditorMode,
            editingLocked: metadata.editingLocked,
            title: metadata.chartTitle,
            cells: metadata.cells,
          },
          {
            includeManualRuns: true,
            includePreferredEditorMode: true,
          },
        ),
      ),
    ],
    "embedded-test.png",
    { type: "image/png" },
  );

  const originalCreateImageBitmap = globalThis.createImageBitmap;
  let createImageBitmapCalled = false;
  globalThis.createImageBitmap = (() => {
    createImageBitmapCalled = true;
    throw new Error("createImageBitmap should not be called for embedded metadata imports");
  }) as typeof globalThis.createImageBitmap;

  try {
    const result = await processImageFile(file, {
      gridMode: "manual",
      reduceColors: true,
      reduceTolerance: 16,
      preSharpen: true,
      preSharpenStrength: 20,
      fftEdgeEnhanceStrength: 30,
    });

    expect(result.detectionMode).toBe("embedded-chart-metadata");
    expect(result.preferredEditorMode).toBe("pindou");
    expect(result.editingLocked).toBe(true);
    expect(result.effectiveEdgeEnhanceStrength).toBe(0);
    expect(result.processingElapsedMs).toBe(0);
    expect(result.colorSystemId).toBe("mard_221");
    expect(result.chartTitle).toBe("Embedded Title");
    expect(result.fileName).toBe("【拼豆豆】embedded-test.png");
    expect(result.gridWidth).toBe(3);
    expect(result.gridHeight).toBe(2);
    expect(result.blob).toBe(file);
    expect(createImageBitmapCalled).toBe(false);
    expect(
      result.cells.map((cell) => ({
        label: cell.label,
        source: cell.source,
        hasHex: typeof cell.hex === "string" || cell.hex === null,
      })),
    ).toEqual([
      { label: "B21", source: "detected", hasHex: true },
      { label: "H7", source: "manual", hasHex: true },
      { label: null, source: null, hasHex: true },
      { label: "H19", source: "detected", hasHex: true },
      { label: "M2", source: "manual", hasHex: true },
      { label: "F9", source: "detected", hasHex: true },
    ]);
  } finally {
    globalThis.createImageBitmap = originalCreateImageBitmap;
  }
});

test("grayscale mode should retain manual edge enhancement strength for converted images", async () => {
  const raster = buildSolidRaster(3, 3, [220, 220, 220]);
  setRasterPixel(raster, 1, 0, [40, 40, 40]);
  setRasterPixel(raster, 1, 2, [40, 40, 40]);
  const file = new File(["stub"], "grayscale-edge-enhance.png", { type: "image/png" });

  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const originalDocument = globalThis.document;
  const originalImage = globalThis.Image;
  const noop = () => {};
  const canvasContext = new Proxy(
    {
      drawImage: noop,
      getImageData() {
        return {
          width: raster.width,
          height: raster.height,
          data: new Uint8ClampedArray(raster.data),
        };
      },
      measureText() {
        return { width: 0 };
      },
      createLinearGradient() {
        return { addColorStop: noop };
      },
      createRadialGradient() {
        return { addColorStop: noop };
      },
      setLineDash: noop,
      getLineDash() {
        return [];
      },
    } as Record<string, unknown>,
    {
      get(target, property) {
        if (property in target) {
          return target[property as keyof typeof target];
        }
        return noop;
      },
    },
  );
  const createElement = (tagName: string) => {
    if (tagName !== "canvas") {
      throw new Error(`unexpected element: ${tagName}`);
    }

    return {
      width: raster.width,
      height: raster.height,
      getContext() {
        return canvasContext;
      },
      toBlob(callback: BlobCallback) {
        callback(new Blob([PNG_SIGNATURE], { type: "image/png" }));
      },
    } as HTMLCanvasElement;
  };

  globalThis.createImageBitmap = (async () =>
    ({
      width: raster.width,
      height: raster.height,
      close() {},
    }) as ImageBitmap) as typeof globalThis.createImageBitmap;
  globalThis.document = { createElement } as Document;
  globalThis.Image = class {
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;
    width = 1;
    height = 1;

    set src(_value: string) {
      queueMicrotask(() => {
        this.onload?.();
      });
    }
  } as typeof Image;

  try {
    const result = await processImageFile(file, {
      gridMode: "manual",
      gridWidth: 3,
      gridHeight: 3,
      grayscaleMode: true,
      reduceColors: false,
      reduceTolerance: 16,
      preSharpen: false,
      preSharpenStrength: 20,
      fftEdgeEnhanceStrength: 30,
    });

    expect(result.detectionMode).toBe("converted-from-image");
    expect(result.effectiveEdgeEnhanceStrength).toBe(30);
    expect(result.processingElapsedMs).toBeGreaterThanOrEqual(0);
  } finally {
    globalThis.createImageBitmap = originalCreateImageBitmap;
    globalThis.document = originalDocument;
    globalThis.Image = originalImage;
  }
});

test("grayscale conversion should write the same gray value into rgb channels", () => {
  const raster = buildSolidRaster(2, 1, [255, 0, 0]);
  setRasterPixel(raster, 1, 0, [0, 255, 0]);

  const grayscale = convertRasterToGrayscale(raster);

  expect(getRasterPixel(grayscale, 0, 0)).toEqual([76, 76, 76]);
  expect(getRasterPixel(grayscale, 1, 0)).toEqual([150, 150, 150]);
});

test("soft grayscale tone curve should gently deepen shadows and lift highlights", () => {
  const raster = buildSolidRaster(3, 1, [64, 64, 64]);
  setRasterPixel(raster, 1, 0, [128, 128, 128]);
  setRasterPixel(raster, 2, 0, [192, 192, 192]);

  const curved = applySoftGrayscaleToneCurve(raster);

  expect(getRasterPixel(curved, 0, 0)[0]).toBeLessThan(64);
  expect(getRasterPixel(curved, 1, 0)).toEqual([128, 128, 128]);
  expect(getRasterPixel(curved, 2, 0)[0]).toBeGreaterThan(192);
});

test("contrast adjustment should expand values around mid gray", () => {
  const raster = buildSolidRaster(3, 1, [128, 128, 128]);
  setRasterPixel(raster, 0, 0, [64, 64, 64]);
  setRasterPixel(raster, 2, 0, [192, 192, 192]);

  const contrasted = applyContrast(raster, 100);

  expect(getRasterPixel(contrasted, 0, 0)).toEqual([0, 0, 0]);
  expect(getRasterPixel(contrasted, 1, 0)).toEqual([128, 128, 128]);
  expect(getRasterPixel(contrasted, 2, 0)).toEqual([255, 255, 255]);
});

test("palette matching should keep transparent logical cells empty", () => {
  const raster = buildSolidRaster(2, 1, [255, 255, 255]);
  setRasterPixelRgba(raster, 1, 0, [0, 0, 0], 0);

  const cells = debugMatchLogicalRasterToPalette(raster, "mard_221");

  expect(cells[0]?.label).not.toBeNull();
  expect(cells[1]).toMatchObject({ label: null, hex: null, source: null });
});

test("grayscale palette matching should dither a flat midtone across multiple gray labels", () => {
  const raster = buildSolidRaster(12, 1, [103, 103, 103]);
  const cells = debugMatchLogicalRasterToPalette(raster, "mard_221", true);
  const labels = cells.map((cell) => cell.label).filter((label): label is string => Boolean(label));

  expect(new Set(labels).size).toBeGreaterThan(1);
});

test("render style bias should disable grayscale dithering at the pixel-art end", () => {
  const raster = buildSolidRaster(12, 1, [103, 103, 103]);
  const realisticCells = debugMatchLogicalRasterToPalette(raster, "mard_221", true, 0);
  const pixelArtCells = debugMatchLogicalRasterToPalette(raster, "mard_221", true, 100);
  const realisticLabels = realisticCells
    .map((cell) => cell.label)
    .filter((label): label is string => Boolean(label));
  const pixelArtLabels = pixelArtCells
    .map((cell) => cell.label)
    .filter((label): label is string => Boolean(label));

  expect(new Set(realisticLabels).size).toBeGreaterThan(1);
  expect(new Set(pixelArtLabels).size).toBe(1);
});

test("grayscale mode should expose the curated MARD 221 gray subset", () => {
  const palette = getPaletteOptions("mard_221", true);
  const labels = palette.map((entry) => entry.label);
  const sortedLabels = [...labels].sort();

  expect(palette.length).toBeGreaterThan(0);
  expect(sortedLabels).toEqual([
    "H1",
    "H10",
    "H11",
    "H17",
    "H2",
    "H22",
    "H3",
    "H4",
    "H5",
    "H6",
    "H7",
    "H9",
  ]);
  expect(labels.includes("H13")).toBe(false);
  expect(labels.includes("H14")).toBe(false);
  expect(labels.includes("H19")).toBe(false);
  expect(labels.includes("H21")).toBe(false);
});

test("grayscale mode should remap gray labels when the color system changes", () => {
  const mardPalette = getPaletteOptions("mard_221", true);
  const cocoPalette = getPaletteOptions("system_COCO", true);

  expect(cocoPalette.length).toBe(mardPalette.length);
  expect(cocoPalette.map((entry) => entry.hex).sort()).toEqual(
    mardPalette.map((entry) => entry.hex).sort(),
  );
  expect(cocoPalette.map((entry) => entry.label)).not.toEqual(
    mardPalette.map((entry) => entry.label),
  );
});

test("chart serialization should keep grayscale-mode labels inside mard_221", () => {
  const serialized = serializeChartPayload(
    {
      colorSystemId: "mard_221",
      gridWidth: 2,
      gridHeight: 2,
      preferredEditorMode: "edit",
      cells: [["H2", 0], ["H7", 1], ["H9", 0], ["H5", 0]],
    },
    {
      includeManualRuns: true,
      includePreferredEditorMode: true,
    },
  );

  expect(deserializeChartPayload(serialized)).toEqual({
    colorSystemId: "mard_221",
    gridWidth: 2,
    gridHeight: 2,
    preferredEditorMode: "edit",
    editingLocked: false,
    title: "",
    cells: [["H2", 0], ["H7", 1], ["H9", 0], ["H5", 0]],
  });
});

