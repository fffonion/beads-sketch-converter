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

interface AxisFit {
  count: number;
  start: number;
  pitch: number;
  positions: number[];
  score: number;
}

interface GridExtraction {
  width: number;
  height: number;
  cells: Rgb[];
  columnFit: AxisFit;
  rowFit: AxisFit;
}

interface CandidateScore {
  strategy: "average" | "dominant" | "nearest" | "edge-aware";
  colorDistance: number;
  occupancyDistance: number;
  totalScore: number;
}

const SOURCE_IMAGE_PATH = "D:/fffonion/Downloads/IMG_6255.jpg";
const TARGET_IMAGE_PATH = "D:/fffonion/Downloads/IMG_6266.JPG";
const OUTPUT_DIR = join(process.cwd(), "output", "reference-crop-grid-experiment");
const TARGET_GRID_SIZE = 40;

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const source = loadRasterWithPowerShell(SOURCE_IMAGE_PATH);
  const target = loadRasterWithPowerShell(TARGET_IMAGE_PATH);
  const crop = loadRefinedCrop();
  const croppedSource = cropRaster(source, crop);
  const targetGrid = extractTargetGrid(target);
  const sourceAxisX = buildAxisDarkness(croppedSource, "x");
  const sourceAxisY = buildAxisDarkness(croppedSource, "y");
  const xPitchCandidates = estimatePitchCandidates(sourceAxisX, 6, 24, 6);
  const yPitchCandidates = estimatePitchCandidates(sourceAxisY, 6, 24, 6);
  const sourceGrid = extractSourceCropGrid(croppedSource, {
    xPitchCandidates,
    yPitchCandidates,
  });

  const candidates = (["average", "dominant", "nearest", "edge-aware"] as const).map((strategy) => {
    const cells = resampleGrid(sourceGrid, TARGET_GRID_SIZE, TARGET_GRID_SIZE, strategy);
    return {
      strategy,
      ...scoreGrid(cells, targetGrid.cells),
    };
  });
  candidates.sort((left, right) => left.totalScore - right.totalScore);
  const best = candidates[0]!;

  writeBmp(join(OUTPUT_DIR, "target-grid.bmp"), renderGridBitmap(TARGET_GRID_SIZE, TARGET_GRID_SIZE, targetGrid.cells, 18));
  writeBmp(
    join(OUTPUT_DIR, "source-crop-grid.bmp"),
    renderGridBitmap(sourceGrid.width, sourceGrid.height, sourceGrid.cells, 10),
  );
  for (const candidate of candidates) {
    writeBmp(
      join(OUTPUT_DIR, `${candidate.strategy}.bmp`),
      renderGridBitmap(
        TARGET_GRID_SIZE,
        TARGET_GRID_SIZE,
        resampleGrid(sourceGrid, TARGET_GRID_SIZE, TARGET_GRID_SIZE, candidate.strategy),
        18,
      ),
    );
  }

  writeFileSync(
    join(OUTPUT_DIR, "analysis.json"),
    JSON.stringify(
      {
        crop,
        xPitchCandidates,
        yPitchCandidates,
        sourceGrid: {
          width: sourceGrid.width,
          height: sourceGrid.height,
          columnFit: summarizeFit(sourceGrid.columnFit),
          rowFit: summarizeFit(sourceGrid.rowFit),
        },
        candidates,
        best,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        crop,
        xPitchCandidates,
        yPitchCandidates,
        sourceGrid: {
          width: sourceGrid.width,
          height: sourceGrid.height,
          columnFit: summarizeFit(sourceGrid.columnFit),
          rowFit: summarizeFit(sourceGrid.rowFit),
        },
        candidates,
      },
      null,
      2,
    ),
  );
}

function loadRefinedCrop(): CropBox {
  const analysis = JSON.parse(
    readFileSync(join(process.cwd(), "output", "reference-crop-search", "analysis.json"), "utf8"),
  ) as { refined: CropBox };
  return analysis.refined;
}

function extractTargetGrid(image: RasterImage) {
  const columnFit = fitAxis(buildAxisDarkness(image, "x"), TARGET_GRID_SIZE, {
    minPitch: 24,
    maxPitch: 34,
    minStart: 0,
    maxStart: 180,
  });
  const rowFit = fitAxis(buildAxisDarkness(image, "y"), TARGET_GRID_SIZE, {
    minPitch: 24,
    maxPitch: 34,
    minStart: 0,
    maxStart: 180,
  });
  const cells: Rgb[] = [];
  for (let row = 0; row < TARGET_GRID_SIZE; row += 1) {
    for (let column = 0; column < TARGET_GRID_SIZE; column += 1) {
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
  return { cells, columnFit, rowFit };
}

function extractSourceCropGrid(
  image: RasterImage,
  options: {
    xPitchCandidates: Array<{ lag: number; score: number }>;
    yPitchCandidates: Array<{ lag: number; score: number }>;
  },
): GridExtraction {
  let best: GridExtraction | null = null;
  const xSearchPitches = expandPitchCandidates(options.xPitchCandidates);
  const ySearchPitches = expandPitchCandidates(options.yPitchCandidates);
  const xAxis = buildAxisDarkness(image, "x");
  const yAxis = buildAxisDarkness(image, "y");

  for (const xPitch of xSearchPitches) {
    const widthCount = Math.round(image.width / xPitch);
    if (widthCount < 50 || widthCount > 110) {
      continue;
    }
    const columnFit = fitAxis(xAxis, widthCount, {
      minPitch: Math.max(6, xPitch - 1.5),
      maxPitch: Math.min(20, xPitch + 1.5),
      minStart: 0,
      maxStart: 24,
    });
    for (const yPitch of ySearchPitches) {
      const heightCount = Math.round(image.height / yPitch);
      if (heightCount < 50 || heightCount > 110) {
        continue;
      }
      const rowFit = fitAxis(yAxis, heightCount, {
        minPitch: Math.max(6, yPitch - 1.5),
        maxPitch: Math.min(20, yPitch + 1.5),
        minStart: 0,
        maxStart: 24,
      });
      const fitScore = columnFit.score + rowFit.score;
      if (best && fitScore <= best.columnFit.score + best.rowFit.score) {
        continue;
      }
      const cells: Rgb[] = [];
      for (let row = 0; row < heightCount; row += 1) {
        for (let column = 0; column < widthCount; column += 1) {
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
      best = {
        width: widthCount,
        height: heightCount,
        cells,
        columnFit,
        rowFit,
      };
    }
  }
  if (!best) {
    throw new Error("failed to extract source crop grid");
  }
  return best;
}

function estimatePitchCandidates(scores: Float32Array, minLag: number, maxLag: number, topN: number) {
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const centered = Array.from(scores, (value) => value - mean);
  const candidates = [];
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let numerator = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = 0; index < centered.length - lag; index += 1) {
      const left = centered[index]!;
      const right = centered[index + lag]!;
      numerator += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const score = numerator / Math.sqrt(Math.max(1e-6, leftEnergy * rightEnergy));
    candidates.push({ lag, score: Number(score.toFixed(6)) });
  }
  candidates.sort((left, right) => right.score - left.score);
  return candidates.slice(0, topN);
}

function expandPitchCandidates(candidates: Array<{ lag: number; score: number }>) {
  const search = new Set<number>();
  for (const candidate of candidates) {
    for (const pitch of [candidate.lag, candidate.lag * 1.5, candidate.lag * 2]) {
      if (pitch >= 6 && pitch <= 20) {
        search.add(Number(pitch.toFixed(2)));
      }
    }
  }
  return [...search].sort((left, right) => left - right);
}

function resampleGrid(
  source: GridExtraction,
  width: number,
  height: number,
  strategy: CandidateScore["strategy"],
) {
  const cells: Rgb[] = [];
  for (let targetRow = 0; targetRow < height; targetRow += 1) {
    const y0 = (targetRow / height) * source.height;
    const y1 = ((targetRow + 1) / height) * source.height;
    const rowIndices = collectSourceIndices(y0, y1, source.height);
    for (let targetColumn = 0; targetColumn < width; targetColumn += 1) {
      const x0 = (targetColumn / width) * source.width;
      const x1 = ((targetColumn + 1) / width) * source.width;
      const columnIndices = collectSourceIndices(x0, x1, source.width);
      const block: Rgb[] = [];
      for (const sourceRow of rowIndices) {
        for (const sourceColumn of columnIndices) {
          block.push(source.cells[sourceRow * source.width + sourceColumn]!);
        }
      }
      cells.push(aggregateBlock(block, strategy));
    }
  }
  return cells;
}

function collectSourceIndices(start: number, end: number, limit: number) {
  const indices: number[] = [];
  const startIndex = Math.floor(start);
  const endIndex = Math.max(startIndex, Math.ceil(end) - 1);
  for (let index = startIndex; index <= endIndex; index += 1) {
    indices.push(clamp(index, 0, limit - 1));
  }
  if (indices.length === 0) {
    indices.push(clamp(Math.round((start + end) * 0.5), 0, limit - 1));
  }
  return [...new Set(indices)];
}

function aggregateBlock(samples: Rgb[], strategy: CandidateScore["strategy"]): Rgb {
  if (strategy === "average") {
    return averageRgb(samples);
  }
  if (strategy === "nearest") {
    return samples[Math.floor(samples.length * 0.5)] ?? averageRgb(samples);
  }

  const dominant = pickDominantColor(samples);
  if (strategy === "dominant" || !dominant) {
    return dominant ?? averageRgb(samples);
  }

  const occupied = samples.filter((sample) => isOccupied(sample));
  const dark = occupied.filter((sample) => rgbLuma(sample) < 92);
  const darkest = pickDominantColor(dark);
  if (darkest && rgbLuma(darkest) + 32 < rgbLuma(dominant)) {
    return darkest;
  }
  return dominant;
}

function scoreGrid(cells: Rgb[], targetCells: Rgb[]) {
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

function fitAxis(
  scores: Float32Array,
  count: number,
  options: { minPitch: number; maxPitch: number; minStart: number; maxStart: number },
): AxisFit {
  let best: AxisFit | null = null;
  for (let pitch = options.minPitch; pitch <= options.maxPitch; pitch += 0.1) {
    for (let start = options.minStart; start <= options.maxStart; start += 0.5) {
      if (start + pitch * count >= scores.length - 1) {
        continue;
      }
      const positions = Array.from({ length: count + 1 }, (_, index) => Math.round(start + pitch * index));
      let score = 0;
      for (const position of positions) {
        score += sampleAxisScore(scores, position);
      }
      if (!best || score > best.score) {
        best = { count, start, pitch, positions, score };
      }
    }
  }
  if (!best) {
    throw new Error("failed to fit axis");
  }
  return best;
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

function cropRaster(image: RasterImage, crop: CropBox): RasterImage {
  const data = new Uint8ClampedArray(crop.size * crop.size * 4);
  for (let y = 0; y < crop.size; y += 1) {
    for (let x = 0; x < crop.size; x += 1) {
      const sourceX = clamp(crop.left + x, 0, image.width - 1);
      const sourceY = clamp(crop.top + y, 0, image.height - 1);
      const sourceIndex = (sourceY * image.width + sourceX) * 4;
      const targetIndex = (y * crop.size + x) * 4;
      data[targetIndex] = image.data[sourceIndex]!;
      data[targetIndex + 1] = image.data[sourceIndex + 1]!;
      data[targetIndex + 2] = image.data[sourceIndex + 2]!;
      data[targetIndex + 3] = 255;
    }
  }
  return {
    width: crop.size,
    height: crop.size,
    data,
  };
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

function summarizeFit(fit: AxisFit) {
  return {
    count: fit.count,
    start: Number(fit.start.toFixed(2)),
    pitch: Number(fit.pitch.toFixed(2)),
    score: Number(fit.score.toFixed(2)),
  };
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

function renderGridBitmap(gridWidth: number, gridHeight: number, cells: Rgb[], scale: number) {
  const bitmap = createBitmap(gridWidth * scale, gridHeight * scale);
  for (let row = 0; row < gridHeight; row += 1) {
    for (let column = 0; column < gridWidth; column += 1) {
      fillRect(bitmap, column * scale, row * scale, scale, scale, cells[row * gridWidth + column]!);
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
