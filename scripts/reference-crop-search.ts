import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Rgb = [number, number, number];

interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface CropBox {
  left: number;
  top: number;
  size: number;
}

interface CandidateScore extends CropBox {
  colorDistance: number;
  occupancyDistance: number;
  totalScore: number;
}

interface AxisFit {
  start: number;
  pitch: number;
  positions: number[];
}

const SOURCE_IMAGE_PATH = "D:/fffonion/Downloads/IMG_6255.jpg";
const TARGET_IMAGE_PATH = "D:/fffonion/Downloads/IMG_6266.JPG";
const GRID_SIZE = 40;
const OUTPUT_DIR = join(process.cwd(), "output", "reference-crop-search");

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const source = loadRasterWithPowerShell(SOURCE_IMAGE_PATH);
  const target = loadRasterWithPowerShell(TARGET_IMAGE_PATH);
  const targetCells = extractTargetGrid(target);

  const coarse = searchBestCrop(source, targetCells, {
    sizeFrom: 720,
    sizeTo: Math.min(1040, source.width),
    sizeStep: 32,
    leftStep: 20,
    topStep: 20,
    maxTop: 420,
  });
  const refined = searchBestCrop(source, targetCells, {
    sizeFrom: Math.max(640, coarse.size - 80),
    sizeTo: Math.min(source.width, coarse.size + 80),
    sizeStep: 8,
    leftStep: 6,
    topStep: 6,
    leftFrom: Math.max(0, coarse.left - 60),
    leftTo: Math.min(source.width - 1, coarse.left + 60),
    topFrom: Math.max(0, coarse.top - 60),
    topTo: Math.min(source.height - 1, coarse.top + 60),
  });

  const bestCells = sampleCropGrid(source, refined, GRID_SIZE, GRID_SIZE);
  writeBmp(join(OUTPUT_DIR, "target-grid.bmp"), renderGridBitmap(targetCells, GRID_SIZE, GRID_SIZE, 18));
  writeBmp(join(OUTPUT_DIR, "best-crop-grid.bmp"), renderGridBitmap(bestCells, GRID_SIZE, GRID_SIZE, 18));
  writeBmp(
    join(OUTPUT_DIR, "best-crop-window.bmp"),
    renderCropPreview(source, refined, 900),
  );
  writeFileSync(
    join(OUTPUT_DIR, "analysis.json"),
    JSON.stringify(
      {
        coarse,
        refined,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ coarse, refined }, null, 2));
}

function extractTargetGrid(image: RasterImage) {
  const columnFit = fitTargetAxis(buildAxisDarkness(image, "x"));
  const rowFit = fitTargetAxis(buildAxisDarkness(image, "y"));
  const cells: Rgb[] = [];
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      cells.push(
        sampleCellColor(
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
      const end = start + pitch * GRID_SIZE;
      if (end >= scores.length - 1) {
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
    throw new Error("failed to fit target axis");
  }
  return best;
}

function searchBestCrop(
  source: RasterImage,
  targetCells: Rgb[],
  options: {
    sizeFrom: number;
    sizeTo: number;
    sizeStep: number;
    leftStep: number;
    topStep: number;
    maxTop?: number;
    leftFrom?: number;
    leftTo?: number;
    topFrom?: number;
    topTo?: number;
  },
) {
  let best: CandidateScore | null = null;
  for (let size = options.sizeFrom; size <= options.sizeTo; size += options.sizeStep) {
    if (size > source.width || size > source.height) {
      continue;
    }
    const leftFrom = options.leftFrom ?? 0;
    const leftTo = Math.min(options.leftTo ?? source.width - size, source.width - size);
    const topFrom = options.topFrom ?? 0;
    const topTo = Math.min(
      options.topTo ?? source.height - size,
      options.maxTop ?? source.height - size,
      source.height - size,
    );
    for (let left = leftFrom; left <= leftTo; left += options.leftStep) {
      for (let top = topFrom; top <= topTo; top += options.topStep) {
        const candidate = { left, top, size };
        const sampled = sampleCropGrid(source, candidate, GRID_SIZE, GRID_SIZE);
        const score = compareGrid(sampled, targetCells);
        if (!best || score.totalScore < best.totalScore) {
          best = { ...candidate, ...score };
        }
      }
    }
  }
  if (!best) {
    throw new Error("failed to search crop");
  }
  return best;
}

function sampleCropGrid(source: RasterImage, crop: CropBox, width: number, height: number) {
  const cells: Rgb[] = [];
  for (let row = 0; row < height; row += 1) {
    const top = crop.top + (row / height) * crop.size;
    const bottom = crop.top + ((row + 1) / height) * crop.size;
    for (let column = 0; column < width; column += 1) {
      const left = crop.left + (column / width) * crop.size;
      const right = crop.left + ((column + 1) / width) * crop.size;
      cells.push(
        sampleCellColor(
          source,
          Math.round(left),
          Math.round(top),
          Math.round(right),
          Math.round(bottom),
        ),
      );
    }
  }
  return cells;
}

function compareGrid(cells: Rgb[], targetCells: Rgb[]) {
  let colorDistance = 0;
  let occupancyDistance = 0;
  for (let index = 0; index < targetCells.length; index += 1) {
    colorDistance += rgbDistance(cells[index]!, targetCells[index]!);
    occupancyDistance += Number(isOccupied(cells[index]!) !== isOccupied(targetCells[index]!));
  }
  return {
    colorDistance,
    occupancyDistance,
    totalScore: colorDistance + occupancyDistance * 140,
  };
}

function isOccupied(rgb: Rgb) {
  return rgbLuma(rgb) < 242;
}

function rgbDistance(left: Rgb, right: Rgb) {
  return Math.sqrt(
    (left[0] - right[0]) * (left[0] - right[0]) +
      (left[1] - right[1]) * (left[1] - right[1]) +
      (left[2] - right[2]) * (left[2] - right[2]),
  );
}

function sampleCellColor(image: RasterImage, left: number, top: number, right: number, bottom: number): Rgb {
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
    const index = (y * image.width + x) * 4;
    samples.push([image.data[index]!, image.data[index + 1]!, image.data[index + 2]!]);
  }
  return averageRgb(samples);
}

function averageRgb(samples: Rgb[]) {
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
    score += scores[index]! * (offset === 0 ? 1 : offset === -1 || offset === 1 ? 0.7 : 0.35);
  }
  return score;
}

function pixelLuma(image: RasterImage, x: number, y: number) {
  const index = (y * image.width + x) * 4;
  return image.data[index]! * 0.299 + image.data[index + 1]! * 0.587 + image.data[index + 2]! * 0.114;
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

function renderCropPreview(source: RasterImage, crop: CropBox, maxEdge: number) {
  const scale = Math.max(1, Math.floor(crop.size / maxEdge));
  const previewSize = Math.max(1, Math.round(crop.size / scale));
  const bitmap = createBitmap(previewSize, previewSize);
  for (let y = 0; y < previewSize; y += 1) {
    for (let x = 0; x < previewSize; x += 1) {
      const sourceX = clamp(crop.left + Math.floor(x * scale), 0, source.width - 1);
      const sourceY = clamp(crop.top + Math.floor(y * scale), 0, source.height - 1);
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const targetIndex = (y * previewSize + x) * 4;
      bitmap.data[targetIndex] = source.data[sourceIndex]!;
      bitmap.data[targetIndex + 1] = source.data[sourceIndex + 1]!;
      bitmap.data[targetIndex + 2] = source.data[sourceIndex + 2]!;
      bitmap.data[targetIndex + 3] = 255;
    }
  }
  return bitmap;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rgbLuma(rgb: Rgb) {
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
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
