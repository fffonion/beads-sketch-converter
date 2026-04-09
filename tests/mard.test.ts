import { expect, test } from "bun:test";
import { basename, join } from "node:path";
import {
  debugAutoDetectRaster,
  debugDetectChartBoardWithWasmPrepared,
  processImageFile,
} from "../src/lib/mard";
import { detectChartBoardWithWasm } from "../src/lib/detecter";

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
  fileName: string;
  gridWidth: number;
  gridHeight: number;
  preferredEditorMode: "edit" | "pindou";
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

function injectChartMetadataChunk(bytes: Uint8Array, metadata: EmbeddedChartMetadata) {
  const keywordBytes = new TextEncoder().encode(chartMetadataKeyword);
  const textBytes = new TextEncoder().encode(JSON.stringify(metadata));
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
  expect(cropHeight).toBeGreaterThan(raster.height * 0.88);
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
    version: 1,
    app: "pindou",
    colorSystemId: "mard_221",
    fileName: "【拼豆豆】embedded-test.png",
    gridWidth: 3,
    gridHeight: 2,
    preferredEditorMode: "pindou",
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
    [injectChartMetadataChunk(basePngBytes, metadata)],
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
    });

    expect(result.detectionMode).toBe("embedded-chart-metadata");
    expect(result.preferredEditorMode).toBe("pindou");
    expect(result.colorSystemId).toBe("mard_221");
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
