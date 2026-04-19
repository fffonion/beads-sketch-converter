import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

interface StrategyScore {
  strategy: string;
  colorDistance: number;
  occupancyDistance: number;
  totalScore: number;
}

const SOURCE_IMAGE_PATH = "D:/fffonion/Downloads/IMG_6255.jpg";
const TARGET_IMAGE_PATH = "D:/fffonion/Downloads/IMG_6266.JPG";
const OUTPUT_DIR = join(process.cwd(), "output", "reference-crop-patch-experiment");
const GRID_SIZE = 40;

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const source = loadRasterWithPowerShell(SOURCE_IMAGE_PATH);
  const target = loadRasterWithPowerShell(TARGET_IMAGE_PATH);
  const crop = loadRefinedCrop();
  const targetCells = extractTargetGrid(target);
  const patchStats = collectPatchStats(source, crop);

  const results = buildStrategyGrids(patchStats).map(({ strategy, cells }) => {
    return {
      strategy,
      cells,
      ...compareGrid(cells, targetCells),
    };
  });
  results.sort((left, right) => left.totalScore - right.totalScore);

  writeBmp(join(OUTPUT_DIR, "target-grid.bmp"), renderGridBitmap(targetCells, GRID_SIZE, 18));
  for (const result of results) {
    writeBmp(join(OUTPUT_DIR, `${result.strategy}.bmp`), renderGridBitmap(result.cells, GRID_SIZE, 18));
  }
  writeFileSync(
    join(OUTPUT_DIR, "analysis.json"),
    JSON.stringify(
      {
        crop,
        results: results.map(({ cells, ...rest }) => rest),
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        crop,
        results: results.map(({ cells, ...rest }) => rest),
      },
      null,
      2,
    ),
  );
}

function loadRefinedCrop(): CropBox {
  const analysis = JSON.parse(
    readFileSync(join(process.cwd(), "output", "reference-crop-hybrid-search", "analysis.json"), "utf8"),
  ) as { refined: CropBox; baselineCrop?: CropBox };
  return analysis.refined ?? analysis.baselineCrop!;
}

function extractTargetGrid(image: RasterImage) {
  const columnFit = fitAxis(buildAxisDarkness(image, "x"));
  const rowFit = fitAxis(buildAxisDarkness(image, "y"));
  const cells: Rgb[] = [];
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let column = 0; column < GRID_SIZE; column += 1) {
      cells.push(
        sampleSparseCell(
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

function fitAxis(scores: Float32Array) {
  let best: { start: number; pitch: number; positions: number[]; score: number } | null = null;
  for (let pitch = 24; pitch <= 34; pitch += 0.1) {
    for (let start = 0; start <= 180; start += 0.5) {
      if (start + pitch * GRID_SIZE >= scores.length - 1) {
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
    throw new Error("failed to fit target grid");
  }
  return best;
}

function collectPatchStats(image: RasterImage, crop: CropBox) {
  const cells: Array<{
    sparse6: Rgb;
    mean: Rgb;
    trimmedMean: Rgb;
    ringMean: Rgb;
    ringDominant: Rgb;
    darkDominant: Rgb | null;
  }> = [];
  for (let row = 0; row < GRID_SIZE; row += 1) {
    const top = crop.top + (row / GRID_SIZE) * crop.size;
    const bottom = crop.top + ((row + 1) / GRID_SIZE) * crop.size;
    for (let column = 0; column < GRID_SIZE; column += 1) {
      const left = crop.left + (column / GRID_SIZE) * crop.size;
      const right = crop.left + ((column + 1) / GRID_SIZE) * crop.size;
      const roundedLeft = Math.round(left);
      const roundedTop = Math.round(top);
      const roundedRight = Math.round(right);
      const roundedBottom = Math.round(bottom);
      const pixels = collectPatchPixels(image, roundedLeft, roundedTop, roundedRight, roundedBottom);
      const ringPixels = collectRingPixels(image, roundedLeft, roundedTop, roundedRight, roundedBottom);
      const ranked = [...pixels].sort((a, b) => rgbLuma(a) - rgbLuma(b));
      const trim = Math.floor(ranked.length * 0.15);
      const occupied = pixels.filter((pixel) => rgbLuma(pixel) < 242);
      const dark = occupied.filter((pixel) => rgbLuma(pixel) < 96);
      cells.push({
        sparse6: sampleSparseCell(image, roundedLeft, roundedTop, roundedRight, roundedBottom),
        mean: averageRgb(pixels),
        trimmedMean: averageRgb(ranked.slice(trim, ranked.length - trim)),
        ringMean: averageRgb(ringPixels),
        ringDominant: pickDominantColor(ringPixels) ?? averageRgb(ringPixels),
        darkDominant: pickDominantColor(dark),
      });
    }
  }
  return cells;
}

function buildStrategyGrids(
  patchStats: ReturnType<typeof collectPatchStats>,
): Array<{ strategy: StrategyScore["strategy"]; cells: Rgb[] }> {
  const sparseOccupied = patchStats.map((cell) => isOccupied(cell.sparse6));
  const strategies: Array<{ strategy: StrategyScore["strategy"]; cells: Rgb[] }> = [
    { strategy: "sparse6", cells: patchStats.map((cell) => cell.sparse6) },
    { strategy: "mean", cells: patchStats.map((cell) => cell.mean) },
    { strategy: "trimmed-mean", cells: patchStats.map((cell) => cell.trimmedMean) },
    { strategy: "ring-mean", cells: patchStats.map((cell) => cell.ringMean) },
    { strategy: "ring-dominant", cells: patchStats.map((cell) => cell.ringDominant) },
    {
      strategy: "hybrid-trim-boundary-sparse",
      cells: patchStats.map((cell, index) =>
        isBoundaryIndex(sparseOccupied, index) ? cell.sparse6 : cell.trimmedMean),
    },
    {
      strategy: "hybrid-ring-boundary-sparse",
      cells: patchStats.map((cell, index) =>
        isBoundaryIndex(sparseOccupied, index) ? cell.sparse6 : cell.ringMean),
    },
    {
      strategy: "hybrid-trim-boundary-dark",
      cells: patchStats.map((cell, index) =>
        isBoundaryIndex(sparseOccupied, index) ? (cell.darkDominant ?? cell.sparse6) : cell.trimmedMean),
    },
    {
      strategy: "hybrid-trim-occupied-sparse",
      cells: patchStats.map((cell) =>
        isOccupied(cell.sparse6) !== isOccupied(cell.trimmedMean) ? cell.sparse6 : cell.trimmedMean),
    },
    {
      strategy: "hybrid-trim-boundary-or-occupied-sparse",
      cells: patchStats.map((cell, index) =>
        isBoundaryIndex(sparseOccupied, index) || (isOccupied(cell.sparse6) !== isOccupied(cell.trimmedMean))
          ? cell.sparse6
          : cell.trimmedMean),
    },
  ];
  for (const alpha of [0.35, 0.5, 0.65]) {
    for (const delta of [10, 20, 30]) {
      strategies.push({
        strategy: `hybrid-trim-darkblend-a${Math.round(alpha * 100)}-d${delta}`,
        cells: patchStats.map((cell) => {
          const sparseOccupiedHere = isOccupied(cell.sparse6);
          const trimOccupiedHere = isOccupied(cell.trimmedMean);
          if (sparseOccupiedHere !== trimOccupiedHere) {
            return cell.sparse6;
          }
          if (
            sparseOccupiedHere &&
            rgbLuma(cell.sparse6) + delta < rgbLuma(cell.trimmedMean)
          ) {
            return blendRgb(cell.trimmedMean, cell.sparse6, alpha);
          }
          return cell.trimmedMean;
        }),
      });
    }
  }
  for (const delta of [15, 25, 35, 45]) {
    strategies.push({
      strategy: `hybrid-trim-darkswitch-d${delta}`,
      cells: patchStats.map((cell) => {
        const sparseOccupiedHere = isOccupied(cell.sparse6);
        const trimOccupiedHere = isOccupied(cell.trimmedMean);
        if (sparseOccupiedHere !== trimOccupiedHere) {
          return cell.sparse6;
        }
        if (
          sparseOccupiedHere &&
          rgbLuma(cell.sparse6) + delta < rgbLuma(cell.trimmedMean)
        ) {
          return cell.sparse6;
        }
        return cell.trimmedMean;
      }),
    });
  }
  return strategies;
}

function sampleSparseCell(image: RasterImage, left: number, top: number, right: number, bottom: number): Rgb {
  const width = Math.max(2, right - left);
  const height = Math.max(2, bottom - top);
  const points = [
    [0.22, 0.22],
    [0.78, 0.22],
    [0.22, 0.78],
    [0.78, 0.78],
    [0.5, 0.18],
    [0.5, 0.82],
  ] as const;
  const samples: Rgb[] = [];
  for (const [rx, ry] of points) {
    const x = clamp(Math.round(left + width * rx), left + 1, right - 2);
    const y = clamp(Math.round(top + height * ry), top + 1, bottom - 2);
    samples.push(readPixel(image, x, y));
  }
  return averageRgb(samples);
}

function collectPatchPixels(image: RasterImage, left: number, top: number, right: number, bottom: number) {
  const pixels: Rgb[] = [];
  for (let y = top + 1; y < bottom - 1; y += 1) {
    for (let x = left + 1; x < right - 1; x += 1) {
      pixels.push(readPixel(image, x, y));
    }
  }
  return pixels;
}

function collectRingPixels(image: RasterImage, left: number, top: number, right: number, bottom: number) {
  const pixels: Rgb[] = [];
  const width = Math.max(2, right - left);
  const height = Math.max(2, bottom - top);
  const innerLeft = left + Math.floor(width * 0.28);
  const innerRight = right - Math.floor(width * 0.28);
  const innerTop = top + Math.floor(height * 0.28);
  const innerBottom = bottom - Math.floor(height * 0.28);
  for (let y = top + 1; y < bottom - 1; y += 1) {
    for (let x = left + 1; x < right - 1; x += 1) {
      if (x >= innerLeft && x < innerRight && y >= innerTop && y < innerBottom) {
        continue;
      }
      pixels.push(readPixel(image, x, y));
    }
  }
  return pixels.length > 0 ? pixels : collectPatchPixels(image, left, top, right, bottom);
}

function isBoundaryIndex(mask: boolean[], index: number) {
  if (!mask[index]) {
    return false;
  }
  const row = Math.floor(index / GRID_SIZE);
  const column = index % GRID_SIZE;
  const offsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;
  for (const [rowOffset, columnOffset] of offsets) {
    const nextRow = row + rowOffset;
    const nextColumn = column + columnOffset;
    if (nextRow < 0 || nextRow >= GRID_SIZE || nextColumn < 0 || nextColumn >= GRID_SIZE) {
      return true;
    }
    if (!mask[nextRow * GRID_SIZE + nextColumn]) {
      return true;
    }
  }
  return false;
}

function readPixel(image: RasterImage, x: number, y: number): Rgb {
  const index = (y * image.width + x) * 4;
  return [image.data[index]!, image.data[index + 1]!, image.data[index + 2]!];
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
    const weight = offset === 0 ? 1 : Math.abs(offset) === 1 ? 0.7 : 0.35;
    score += scores[index]! * weight;
  }
  return score;
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

function pickDominantColor(samples: Rgb[]) {
  if (samples.length === 0) {
    return null;
  }
  const buckets = new Map<number, { count: number; sum: [number, number, number] }>();
  for (const sample of samples) {
    const key = ((sample[0] >> 3) << 10) | ((sample[1] >> 3) << 5) | (sample[2] >> 3);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, sum: [0, 0, 0] };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    bucket.sum[0] += sample[0];
    bucket.sum[1] += sample[1];
    bucket.sum[2] += sample[2];
  }
  let best: { count: number; sum: [number, number, number] } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) {
      best = bucket;
    }
  }
  if (!best) {
    return null;
  }
  return [
    Math.round(best.sum[0] / best.count),
    Math.round(best.sum[1] / best.count),
    Math.round(best.sum[2] / best.count),
  ] as Rgb;
}

function averageRgb(samples: Rgb[]) {
  if (samples.length === 0) {
    return [255, 255, 255];
  }
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

function blendRgb(base: Rgb, accent: Rgb, alpha: number): Rgb {
  const keep = 1 - alpha;
  return [
    Math.round(base[0] * keep + accent[0] * alpha),
    Math.round(base[1] * keep + accent[1] * alpha),
    Math.round(base[2] * keep + accent[2] * alpha),
  ];
}

function pixelLuma(image: RasterImage, x: number, y: number) {
  const index = (y * image.width + x) * 4;
  return image.data[index]! * 0.299 + image.data[index + 1]! * 0.587 + image.data[index + 2]! * 0.114;
}

function rgbLuma(rgb: Rgb) {
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function renderGridBitmap(cells: Rgb[], gridSize: number, scale: number) {
  const bitmap = createBitmap(gridSize * scale, gridSize * scale);
  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      fillRect(bitmap, column * scale, row * scale, scale, scale, cells[row * gridSize + column]!);
    }
  }
  return bitmap;
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
