import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Rgb = [number, number, number];

interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
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
  columnFit: AxisFit;
  rowFit: AxisFit;
  cells: Rgb[];
}

interface WindowScore {
  startRow: number;
  colorDistance: number;
  occupancyDistance: number;
  totalScore: number;
}

interface ResampleScore {
  strategy: "average" | "dominant" | "edge-aware";
  startRow: number;
  windowHeight: number;
  colorDistance: number;
  occupancyDistance: number;
  totalScore: number;
}

interface RowPickScore {
  startRow: number;
  windowHeight: number;
  selectedRows: number[];
  colorDistance: number;
  occupancyDistance: number;
  totalScore: number;
}

interface SolidifyScore {
  backgroundThreshold: number;
  occupancyThreshold: number;
  darkThreshold: number;
  edgeMode: "mask-only" | "mask-or-dark";
  colorDistance: number;
  occupancyDistance: number;
  totalScore: number;
}

const SOURCE_IMAGE_PATH = "D:/fffonion/Downloads/IMG_6255.jpg";
const TARGET_IMAGE_PATH = "D:/fffonion/Downloads/IMG_6266.JPG";
const OUTPUT_DIR = join(process.cwd(), "output", "reference-grid-analysis");
const TARGET_GRID_SIZE = 40;

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const source = loadRasterWithPowerShell(SOURCE_IMAGE_PATH);
  const target = loadRasterWithPowerShell(TARGET_IMAGE_PATH);

  const targetGrid = extractGrid(target, TARGET_GRID_SIZE, TARGET_GRID_SIZE, {
    minPitch: 24,
    maxPitch: 34,
    startPadding: 8,
  });
  const sourceColumnFit = fitAxis(buildAxisDarkness(source, "x"), TARGET_GRID_SIZE, {
    minPitch: 18,
    maxPitch: 28,
    minStart: 6,
    maxStart: 120,
  });
  let bestSourceGrid: GridExtraction | null = null;
  for (let candidateRows = 45; candidateRows <= 90; candidateRows += 1) {
    const sourceGrid = extractGrid(source, TARGET_GRID_SIZE, candidateRows, {
      minPitch: 8,
      maxPitch: 28,
      startPadding: 6,
      fixedColumns: sourceColumnFit,
    });
    if (!bestSourceGrid || sourceGrid.rowFit.score > bestSourceGrid.rowFit.score) {
      bestSourceGrid = sourceGrid;
    }
  }
  if (!bestSourceGrid) {
    throw new Error("failed to extract source grid");
  }

  const bestWindow = findBestMatchingWindow(bestSourceGrid, targetGrid);
  const bestResample = findBestResample(bestSourceGrid, targetGrid);
  const bestRowPick = findBestRowPick(bestSourceGrid, targetGrid);
  const bestSolidify = findBestSolidify(bestSourceGrid, targetGrid, bestRowPick);

  writeBmp(
    join(OUTPUT_DIR, "target-grid.bmp"),
    renderGridBitmap(targetGrid.width, targetGrid.height, targetGrid.cells, 18),
  );
  writeBmp(
    join(OUTPUT_DIR, "source-grid.bmp"),
    renderGridBitmap(bestSourceGrid.width, bestSourceGrid.height, bestSourceGrid.cells, 12),
  );
  writeBmp(
    join(OUTPUT_DIR, "best-source-window.bmp"),
    renderGridBitmap(
      targetGrid.width,
      targetGrid.height,
      sliceGridWindow(bestSourceGrid, bestWindow.startRow, targetGrid.height),
      18,
    ),
  );
  writeBmp(
    join(OUTPUT_DIR, "best-resample-grid.bmp"),
    renderGridBitmap(
      targetGrid.width,
      targetGrid.height,
      resampleGridWindow(bestSourceGrid, bestResample.startRow, bestResample.windowHeight, bestResample.strategy),
      18,
    ),
  );
  writeBmp(
    join(OUTPUT_DIR, "best-row-pick-grid.bmp"),
    renderGridBitmap(
      targetGrid.width,
      targetGrid.height,
      buildGridFromSelectedRows(bestSourceGrid, bestRowPick.selectedRows),
      18,
    ),
  );
  writeBmp(
    join(OUTPUT_DIR, "best-solidify-grid.bmp"),
    renderGridBitmap(
      targetGrid.width,
      targetGrid.height,
      buildSolidifiedGrid(bestSourceGrid, bestRowPick, bestSolidify),
      18,
    ),
  );

  writeFileSync(
    join(OUTPUT_DIR, "analysis.json"),
    JSON.stringify(
      {
        source: {
          imagePath: SOURCE_IMAGE_PATH,
          width: source.width,
          height: source.height,
          extractedGridHeight: bestSourceGrid.height,
          columnFit: summarizeFit(bestSourceGrid.columnFit),
          rowFit: summarizeFit(bestSourceGrid.rowFit),
        },
        target: {
          imagePath: TARGET_IMAGE_PATH,
          width: target.width,
          height: target.height,
          columnFit: summarizeFit(targetGrid.columnFit),
          rowFit: summarizeFit(targetGrid.rowFit),
        },
        bestWindow,
        bestResample,
        bestRowPick: {
          ...bestRowPick,
          selectedRows: summarizeSelectedRows(bestRowPick.selectedRows),
        },
        bestSolidify,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        sourceGridHeight: bestSourceGrid.height,
        bestWindow,
        bestResample,
        bestRowPick: {
          ...bestRowPick,
          selectedRows: summarizeSelectedRows(bestRowPick.selectedRows),
        },
        bestSolidify,
      },
      null,
      2,
    ),
  );
}

function extractGrid(
  image: RasterImage,
  widthCount: number,
  heightCount: number,
  options: {
    minPitch: number;
    maxPitch: number;
    startPadding: number;
    fixedColumns?: AxisFit;
  },
): GridExtraction {
  const columnFit =
    options.fixedColumns ??
    fitAxis(buildAxisDarkness(image, "x"), widthCount, {
      minPitch: options.minPitch,
      maxPitch: options.maxPitch,
      minStart: options.startPadding,
      maxStart: Math.max(options.startPadding, Math.round(image.width * 0.18)),
    });
  const rowFit = fitAxis(buildAxisDarkness(image, "y"), heightCount, {
    minPitch: options.minPitch,
    maxPitch: options.maxPitch,
    minStart: options.startPadding,
    maxStart: Math.max(options.startPadding, Math.round(image.height * 0.18)),
  });

  const cells: Rgb[] = [];
  for (let row = 0; row < heightCount; row += 1) {
    const top = rowFit.positions[row]!;
    const bottom = rowFit.positions[row + 1]!;
    for (let column = 0; column < widthCount; column += 1) {
      const left = columnFit.positions[column]!;
      const right = columnFit.positions[column + 1]!;
      cells.push(sampleCellColor(image, left, top, right, bottom));
    }
  }

  return {
    width: widthCount,
    height: heightCount,
    columnFit,
    rowFit,
    cells,
  };
}

function fitAxis(
  scores: Float32Array,
  count: number,
  options: { minPitch: number; maxPitch: number; minStart: number; maxStart: number },
): AxisFit {
  let best: AxisFit | null = null;
  for (let pitch = options.minPitch; pitch <= options.maxPitch; pitch += 0.1) {
    const lastPosition = pitch * count;
    for (let start = options.minStart; start <= options.maxStart; start += 0.5) {
      if (start + lastPosition >= scores.length - 1) {
        continue;
      }
      const positions = Array.from({ length: count + 1 }, (_, index) => Math.round(start + pitch * index));
      let score = 0;
      for (const position of positions) {
        score += sampleAxisScore(scores, position);
      }
      if (!best || score > best.score) {
        best = {
          count,
          start,
          pitch,
          positions,
          score,
        };
      }
    }
  }
  if (!best) {
    throw new Error("failed to fit axis");
  }
  return best;
}

function buildAxisDarkness(image: RasterImage, axis: "x" | "y") {
  const length = axis === "x" ? image.width : image.height;
  const scores = new Float32Array(length);
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
    const weight = offset === 0 ? 1 : offset === -1 || offset === 1 ? 0.7 : 0.35;
    score += scores[index]! * weight;
  }
  return score;
}

function pixelLuma(image: RasterImage, x: number, y: number) {
  const index = (y * image.width + x) * 4;
  return image.data[index]! * 0.299 + image.data[index + 1]! * 0.587 + image.data[index + 2]! * 0.114;
}

function sampleCellColor(image: RasterImage, left: number, top: number, right: number, bottom: number): Rgb {
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const points = [
    [0.24, 0.24],
    [0.76, 0.24],
    [0.24, 0.76],
    [0.76, 0.76],
    [0.5, 0.18],
    [0.5, 0.82],
  ] as const;
  const samples: Rgb[] = [];
  for (const [rx, ry] of points) {
    const x = Math.max(left + 1, Math.min(right - 2, Math.round(left + width * rx)));
    const y = Math.max(top + 1, Math.min(bottom - 2, Math.round(top + height * ry)));
    const index = (y * image.width + x) * 4;
    samples.push([
      image.data[index]!,
      image.data[index + 1]!,
      image.data[index + 2]!,
    ]);
  }
  return averageRgb(samples);
}

function averageRgb(samples: Rgb[]): Rgb {
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

function findBestMatchingWindow(source: GridExtraction, target: GridExtraction): WindowScore {
  if (source.width !== target.width || source.height < target.height) {
    throw new Error("source grid cannot be compared to target window");
  }
  let best: WindowScore | null = null;
  for (let startRow = 0; startRow <= source.height - target.height; startRow += 1) {
    let colorDistance = 0;
    let occupancyDistance = 0;
    for (let row = 0; row < target.height; row += 1) {
      for (let column = 0; column < target.width; column += 1) {
        const sourceColor = source.cells[(startRow + row) * source.width + column]!;
        const targetColor = target.cells[row * target.width + column]!;
        colorDistance += rgbDistance(sourceColor, targetColor);
        occupancyDistance +=
          Number(isOccupiedCell(sourceColor) !== isOccupiedCell(targetColor));
      }
    }
    const totalScore = colorDistance + occupancyDistance * 120;
    const candidate = {
      startRow,
      colorDistance,
      occupancyDistance,
      totalScore,
    };
    if (!best || candidate.totalScore < best.totalScore) {
      best = candidate;
    }
  }
  if (!best) {
    throw new Error("failed to compare source and target");
  }
  return best;
}

function findBestResample(source: GridExtraction, target: GridExtraction): ResampleScore {
  if (source.width !== target.width || source.height < target.height) {
    throw new Error("source grid cannot be resampled to target");
  }

  let best: ResampleScore | null = null;
  for (const strategy of ["average", "dominant", "edge-aware"] as const) {
    for (let windowHeight = target.height; windowHeight <= source.height; windowHeight += 1) {
      for (let startRow = 0; startRow <= source.height - windowHeight; startRow += 1) {
        const cells = resampleGridWindow(source, startRow, windowHeight, strategy);
        let colorDistance = 0;
        let occupancyDistance = 0;
        for (let index = 0; index < target.cells.length; index += 1) {
          colorDistance += rgbDistance(cells[index]!, target.cells[index]!);
          occupancyDistance += Number(isOccupiedCell(cells[index]!) !== isOccupiedCell(target.cells[index]!));
        }
        const candidate: ResampleScore = {
          strategy,
          startRow,
          windowHeight,
          colorDistance,
          occupancyDistance,
          totalScore: colorDistance + occupancyDistance * 120,
        };
        if (!best || candidate.totalScore < best.totalScore) {
          best = candidate;
        }
      }
    }
  }

  if (!best) {
    throw new Error("failed to resample source grid");
  }
  return best;
}

function findBestRowPick(source: GridExtraction, target: GridExtraction): RowPickScore {
  if (source.width !== target.width || source.height < target.height) {
    throw new Error("source grid cannot be row-picked to target");
  }

  let best: RowPickScore | null = null;
  for (let windowHeight = target.height; windowHeight <= source.height; windowHeight += 1) {
    for (let startRow = 0; startRow <= source.height - windowHeight; startRow += 1) {
      const candidate = solveRowPickCandidate(source, target, startRow, windowHeight);
      if (!best || candidate.totalScore < best.totalScore) {
        best = candidate;
      }
    }
  }

  if (!best) {
    throw new Error("failed to solve row-pick strategy");
  }
  return best;
}

function solveRowPickCandidate(
  source: GridExtraction,
  target: GridExtraction,
  startRow: number,
  windowHeight: number,
): RowPickScore {
  const rowDistances = Array.from({ length: target.height }, (_, targetRow) =>
    Array.from({ length: windowHeight }, (_, localSourceRow) =>
      measureRowDistance(source, startRow + localSourceRow, target, targetRow),
    ),
  );

  const dp = Array.from({ length: target.height }, () => new Float64Array(windowHeight).fill(Number.POSITIVE_INFINITY));
  const parent = Array.from({ length: target.height }, () => new Int16Array(windowHeight).fill(-1));

  const firstRowDistances = rowDistances[0]!;
  for (let sourceRow = 0; sourceRow < windowHeight; sourceRow += 1) {
    dp[0]![sourceRow] = firstRowDistances[sourceRow]!.totalScore;
  }

  for (let targetRow = 1; targetRow < target.height; targetRow += 1) {
    let bestPrefixScore = Number.POSITIVE_INFINITY;
    let bestPrefixIndex = -1;
    for (let sourceRow = targetRow; sourceRow < windowHeight; sourceRow += 1) {
      const previousRow = sourceRow - 1;
      const previousScore = dp[targetRow - 1]![previousRow]!;
      if (previousScore < bestPrefixScore) {
        bestPrefixScore = previousScore;
        bestPrefixIndex = previousRow;
      }
      const rowDistance = rowDistances[targetRow]![sourceRow]!;
      dp[targetRow]![sourceRow] = bestPrefixScore + rowDistance.totalScore;
      parent[targetRow]![sourceRow] = bestPrefixIndex;
    }
  }

  let bestScore = Number.POSITIVE_INFINITY;
  let bestSourceRow = -1;
  for (let sourceRow = target.height - 1; sourceRow < windowHeight; sourceRow += 1) {
    const score = dp[target.height - 1]![sourceRow]!;
    if (score < bestScore) {
      bestScore = score;
      bestSourceRow = sourceRow;
    }
  }
  if (bestSourceRow < 0) {
    throw new Error("failed to recover best row pick path");
  }

  const selectedRows = new Array<number>(target.height);
  let currentSourceRow = bestSourceRow;
  for (let targetRow = target.height - 1; targetRow >= 0; targetRow -= 1) {
    selectedRows[targetRow] = startRow + currentSourceRow;
    currentSourceRow = parent[targetRow]![currentSourceRow]!;
  }

  let colorDistance = 0;
  let occupancyDistance = 0;
  for (let targetRow = 0; targetRow < target.height; targetRow += 1) {
    const rowDistance = rowDistances[targetRow]![selectedRows[targetRow]! - startRow]!;
    colorDistance += rowDistance.colorDistance;
    occupancyDistance += rowDistance.occupancyDistance;
  }

  return {
    startRow,
    windowHeight,
    selectedRows,
    colorDistance,
    occupancyDistance,
    totalScore: colorDistance + occupancyDistance * 120,
  };
}

function buildGridFromSelectedRows(source: GridExtraction, selectedRows: number[]) {
  const cells: Rgb[] = [];
  for (const sourceRow of selectedRows) {
    for (let column = 0; column < source.width; column += 1) {
      cells.push(source.cells[sourceRow * source.width + column]!);
    }
  }
  return cells;
}

function findBestSolidify(source: GridExtraction, target: GridExtraction, rowPick: RowPickScore): SolidifyScore {
  let best: SolidifyScore | null = null;
  for (const backgroundThreshold of [238, 242, 246] as const) {
    for (const occupancyThreshold of [0.2, 0.35, 0.5] as const) {
      for (const darkThreshold of [52, 68, 84, 100] as const) {
        for (const edgeMode of ["mask-only", "mask-or-dark"] as const) {
          const grid = buildSolidifiedGrid(source, rowPick, {
            backgroundThreshold,
            occupancyThreshold,
            darkThreshold,
            edgeMode,
          });
          const score = scoreGridAgainstTarget(grid, target);
          const candidate: SolidifyScore = {
            backgroundThreshold,
            occupancyThreshold,
            darkThreshold,
            edgeMode,
            ...score,
          };
          if (!best || candidate.totalScore < best.totalScore) {
            best = candidate;
          }
        }
      }
    }
  }
  if (!best) {
    throw new Error("failed to solidify row-pick grid");
  }
  return best;
}

function buildSolidifiedGrid(
  source: GridExtraction,
  rowPick: Pick<RowPickScore, "startRow" | "windowHeight" | "selectedRows">,
  params: Pick<SolidifyScore, "backgroundThreshold" | "occupancyThreshold" | "darkThreshold" | "edgeMode">,
) {
  const segments = buildSelectedRowSegments(rowPick);
  const occupiedMask = Array.from({ length: TARGET_GRID_SIZE }, () => new Array<boolean>(source.width).fill(false));
  const cellSamples = Array.from({ length: TARGET_GRID_SIZE }, () =>
    new Array<ReturnType<typeof collectSegmentSamples>>(source.width),
  );

  for (let row = 0; row < TARGET_GRID_SIZE; row += 1) {
    const samples = collectRowSegmentCells(source, segments[row]!);
    for (let column = 0; column < source.width; column += 1) {
      const summary = collectSegmentSamples(samples[column]!, params.backgroundThreshold, params.darkThreshold);
      cellSamples[row]![column] = summary;
      occupiedMask[row]![column] = summary.occupiedRatio >= params.occupancyThreshold;
    }
  }

  const cells: Rgb[] = [];
  for (let row = 0; row < TARGET_GRID_SIZE; row += 1) {
    for (let column = 0; column < source.width; column += 1) {
      const summary = cellSamples[row]![column]!;
      if (!occupiedMask[row]![column]) {
        cells.push(summary.backgroundColor ?? summary.brightestColor ?? [248, 248, 248]);
        continue;
      }
      const edge = isBoundaryCell(occupiedMask, row, column);
      const preferDark = params.edgeMode === "mask-or-dark"
        ? edge || summary.darkRatio >= 0.35
        : edge;
      if (preferDark && summary.darkColor) {
        cells.push(summary.darkColor);
        continue;
      }
      if (summary.fillColor) {
        cells.push(summary.fillColor);
        continue;
      }
      if (summary.occupiedColor) {
        cells.push(summary.occupiedColor);
        continue;
      }
      cells.push(summary.brightestColor ?? [248, 248, 248]);
    }
  }
  return cells;
}

function buildSelectedRowSegments(rowPick: Pick<RowPickScore, "startRow" | "windowHeight" | "selectedRows">) {
  const boundaries = new Array<number>(rowPick.selectedRows.length + 1);
  boundaries[0] = rowPick.startRow;
  for (let index = 1; index < rowPick.selectedRows.length; index += 1) {
    boundaries[index] = Math.floor((rowPick.selectedRows[index - 1]! + rowPick.selectedRows[index]!) * 0.5);
  }
  boundaries[rowPick.selectedRows.length] = rowPick.startRow + rowPick.windowHeight;
  return boundaries.slice(0, -1).map((start, index) => ({
    start,
    end: Math.max(start + 1, boundaries[index + 1]!),
  }));
}

function collectRowSegmentCells(source: GridExtraction, segment: { start: number; end: number }) {
  const columns = Array.from({ length: source.width }, () => [] as Rgb[]);
  for (let sourceRow = segment.start; sourceRow < segment.end; sourceRow += 1) {
    for (let column = 0; column < source.width; column += 1) {
      columns[column]!.push(source.cells[sourceRow * source.width + column]!);
    }
  }
  return columns;
}

function collectSegmentSamples(samples: Rgb[], backgroundThreshold: number, darkThreshold: number) {
  const occupied = samples.filter((sample) => rgbLuma(sample) < backgroundThreshold);
  const dark = occupied.filter((sample) => rgbLuma(sample) < darkThreshold);
  const fill = occupied.filter((sample) => rgbLuma(sample) >= darkThreshold);
  const background = samples.filter((sample) => rgbLuma(sample) >= backgroundThreshold);
  return {
    occupiedRatio: occupied.length / samples.length,
    darkRatio: dark.length / samples.length,
    occupiedColor: pickDominantColor(occupied),
    darkColor: pickDominantColor(dark),
    fillColor: pickDominantColor(fill),
    backgroundColor: pickBrightAverage(background),
    brightestColor: pickBrightAverage(samples),
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

function pickBrightAverage(samples: Rgb[]) {
  if (samples.length === 0) {
    return null;
  }
  const ranked = [...samples].sort((left, right) => rgbLuma(right) - rgbLuma(left));
  return averageRgb(ranked.slice(0, Math.max(1, Math.ceil(ranked.length * 0.5))));
}

function isBoundaryCell(mask: boolean[][], row: number, column: number) {
  const offsets = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;
  for (const [rowOffset, columnOffset] of offsets) {
    const nextRow = row + rowOffset;
    const nextColumn = column + columnOffset;
    if (nextRow < 0 || nextRow >= mask.length || nextColumn < 0 || nextColumn >= mask[0]!.length) {
      return true;
    }
    if (!mask[nextRow]![nextColumn]) {
      return true;
    }
  }
  return false;
}

function scoreGridAgainstTarget(cells: Rgb[], target: GridExtraction) {
  let colorDistance = 0;
  let occupancyDistance = 0;
  for (let index = 0; index < target.cells.length; index += 1) {
    colorDistance += rgbDistance(cells[index]!, target.cells[index]!);
    occupancyDistance += Number(isOccupiedCell(cells[index]!) !== isOccupiedCell(target.cells[index]!));
  }
  return {
    colorDistance,
    occupancyDistance,
    totalScore: colorDistance + occupancyDistance * 120,
  };
}

function measureRowDistance(
  source: GridExtraction,
  sourceRow: number,
  target: GridExtraction,
  targetRow: number,
) {
  let colorDistance = 0;
  let occupancyDistance = 0;
  for (let column = 0; column < source.width; column += 1) {
    const sourceColor = source.cells[sourceRow * source.width + column]!;
    const targetColor = target.cells[targetRow * target.width + column]!;
    colorDistance += rgbDistance(sourceColor, targetColor);
    occupancyDistance += Number(isOccupiedCell(sourceColor) !== isOccupiedCell(targetColor));
  }
  return {
    colorDistance,
    occupancyDistance,
    totalScore: colorDistance + occupancyDistance * 120,
  };
}

function resampleGridWindow(
  source: GridExtraction,
  startRow: number,
  windowHeight: number,
  strategy: "average" | "dominant" | "edge-aware",
) {
  const cells: Rgb[] = [];
  for (let row = 0; row < TARGET_GRID_SIZE; row += 1) {
    const spanTop = startRow + (row / TARGET_GRID_SIZE) * windowHeight;
    const spanBottom = startRow + ((row + 1) / TARGET_GRID_SIZE) * windowHeight;
    const sampleRows = collectSampleRows(spanTop, spanBottom, source.height);
    for (let column = 0; column < source.width; column += 1) {
      const samples = sampleRows.map((sourceRow) => source.cells[sourceRow * source.width + column]!);
      cells.push(aggregateColumnSamples(samples, strategy));
    }
  }
  return cells;
}

function collectSampleRows(spanTop: number, spanBottom: number, height: number) {
  const rows: number[] = [];
  const start = Math.floor(spanTop);
  const end = Math.max(start, Math.ceil(spanBottom) - 1);
  for (let row = start; row <= end; row += 1) {
    rows.push(clamp(row, 0, height - 1));
  }
  if (rows.length === 0) {
    rows.push(clamp(Math.round((spanTop + spanBottom) * 0.5), 0, height - 1));
  }
  return [...new Set(rows)];
}

function aggregateColumnSamples(
  samples: Rgb[],
  strategy: "average" | "dominant" | "edge-aware",
): Rgb {
  if (strategy === "average") {
    return averageRgb(samples);
  }

  const buckets = new Map<number, { count: number; rgbSum: [number, number, number] }>();
  let darkest: Rgb | null = null;
  let darkestLuma = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    const key = ((sample[0] >> 3) << 10) | ((sample[1] >> 3) << 5) | (sample[2] >> 3);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, rgbSum: [0, 0, 0] };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    bucket.rgbSum[0] += sample[0];
    bucket.rgbSum[1] += sample[1];
    bucket.rgbSum[2] += sample[2];
    const luma = rgbLuma(sample);
    if (luma < darkestLuma) {
      darkest = sample;
      darkestLuma = luma;
    }
  }

  let dominant: Rgb | null = null;
  let dominantCount = -1;
  for (const bucket of buckets.values()) {
    if (bucket.count <= dominantCount) {
      continue;
    }
    dominantCount = bucket.count;
    dominant = [
      Math.round(bucket.rgbSum[0] / bucket.count),
      Math.round(bucket.rgbSum[1] / bucket.count),
      Math.round(bucket.rgbSum[2] / bucket.count),
    ];
  }
  if (!dominant) {
    return averageRgb(samples);
  }
  if (strategy === "dominant") {
    return dominant;
  }

  if (darkest && rgbLuma(darkest) + 36 < rgbLuma(dominant) && isOccupiedCell(darkest)) {
    return darkest;
  }
  return dominant;
}

function rgbDistance(left: Rgb, right: Rgb) {
  return Math.sqrt(
    (left[0] - right[0]) * (left[0] - right[0]) +
      (left[1] - right[1]) * (left[1] - right[1]) +
      (left[2] - right[2]) * (left[2] - right[2]),
  );
}

function isOccupiedCell(rgb: Rgb) {
  const luma = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
  return luma < 242;
}

function sliceGridWindow(source: GridExtraction, startRow: number, height: number) {
  const cells: Rgb[] = [];
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < source.width; column += 1) {
      cells.push(source.cells[(startRow + row) * source.width + column]!);
    }
  }
  return cells;
}

function summarizeFit(fit: AxisFit) {
  return {
    count: fit.count,
    start: Number(fit.start.toFixed(2)),
    pitch: Number(fit.pitch.toFixed(2)),
    score: Number(fit.score.toFixed(2)),
  };
}

function summarizeSelectedRows(rows: number[]) {
  if (rows.length <= 8) {
    return rows;
  }
  return [...rows.slice(0, 4), "...", ...rows.slice(-4)];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rgbLuma(rgb: Rgb) {
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
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
