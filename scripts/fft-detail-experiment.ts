import { mkdirSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { enhanceEdgesWithFftWasm } from "../src/lib/detecter";

type Rgb = [number, number, number];

interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface MapSummary {
  lineCells: number[];
  detailCells: number[];
  structureCells: number[];
  detailMask: number[];
  structureMask: number[];
  finalCells: string[];
  detailRatio: number;
  structureRatio: number;
  uniqueColors: number;
}

interface Preset {
  name: string;
  fftStrength: number;
  pixelLineThreshold: number;
  pixelDetailThreshold: number;
  cellLineThreshold: number;
  cellDetailThreshold: number;
  minCoverage: number;
  maxCoverage: number;
  blendMin: number;
  blendMax: number;
  normalMergeTolerance: number;
  detailMergeTolerance: number;
  rareLimit: number;
  dominantBucketSize: number;
  structureMaxCoverage: number;
  structureMinSpan: number;
  structureCrossSpan: number;
  structureBlendBoost: number;
}

interface ExperimentResult extends MapSummary {
  name: string;
  fftStrength: number;
}

interface Oklab {
  l: number;
  a: number;
  b: number;
}

interface CellStats {
  lineScore: number;
  detailScore: number;
  coverage: number;
  candidateCount: number;
  visibleCount: number;
  detailColor: Rgb | null;
  detailColorDistinct: boolean;
}

const DEFAULT_IMAGE_PATH = "D:/fffonion/Downloads/IMG_6255.jpg";
const DEFAULT_GRID_WIDTH = 40;
const OUTPUT_DIR = join(process.cwd(), "output", "fft-detail-experiment");
const ALPHA_VISIBLE_THRESHOLD = 16;
const PRESETS: Preset[] = [
  {
    name: "p1-conservative",
    fftStrength: 22,
    pixelLineThreshold: 0.12,
    pixelDetailThreshold: 0.18,
    cellLineThreshold: 0.22,
    cellDetailThreshold: 0.15,
    minCoverage: 0.01,
    maxCoverage: 0.16,
    blendMin: 0.42,
    blendMax: 0.6,
    normalMergeTolerance: 22,
    detailMergeTolerance: 14,
    rareLimit: 4,
    dominantBucketSize: 28,
    structureMaxCoverage: 0.34,
    structureMinSpan: 5,
    structureCrossSpan: 3,
    structureBlendBoost: 0.12,
  },
  {
    name: "p2-balanced",
    fftStrength: 30,
    pixelLineThreshold: 0.1,
    pixelDetailThreshold: 0.15,
    cellLineThreshold: 0.2,
    cellDetailThreshold: 0.13,
    minCoverage: 0.01,
    maxCoverage: 0.18,
    blendMin: 0.48,
    blendMax: 0.68,
    normalMergeTolerance: 22,
    detailMergeTolerance: 14,
    rareLimit: 4,
    dominantBucketSize: 24,
    structureMaxCoverage: 0.42,
    structureMinSpan: 4,
    structureCrossSpan: 2,
    structureBlendBoost: 0.16,
  },
  {
    name: "p3-strong-detail",
    fftStrength: 38,
    pixelLineThreshold: 0.09,
    pixelDetailThreshold: 0.13,
    cellLineThreshold: 0.18,
    cellDetailThreshold: 0.12,
    minCoverage: 0.01,
    maxCoverage: 0.2,
    blendMin: 0.55,
    blendMax: 0.78,
    normalMergeTolerance: 21,
    detailMergeTolerance: 13,
    rareLimit: 4,
    dominantBucketSize: 24,
    structureMaxCoverage: 0.5,
    structureMinSpan: 4,
    structureCrossSpan: 2,
    structureBlendBoost: 0.22,
  },
  {
    name: "p4-strong-line",
    fftStrength: 48,
    pixelLineThreshold: 0.08,
    pixelDetailThreshold: 0.12,
    cellLineThreshold: 0.16,
    cellDetailThreshold: 0.1,
    minCoverage: 0.01,
    maxCoverage: 0.22,
    blendMin: 0.62,
    blendMax: 0.84,
    normalMergeTolerance: 20,
    detailMergeTolerance: 12,
    rareLimit: 4,
    dominantBucketSize: 24,
    structureMaxCoverage: 0.52,
    structureMinSpan: 4,
    structureCrossSpan: 2,
    structureBlendBoost: 0.2,
  },
  {
    name: "p5-clean-merge",
    fftStrength: 34,
    pixelLineThreshold: 0.11,
    pixelDetailThreshold: 0.16,
    cellLineThreshold: 0.19,
    cellDetailThreshold: 0.14,
    minCoverage: 0.01,
    maxCoverage: 0.17,
    blendMin: 0.5,
    blendMax: 0.7,
    normalMergeTolerance: 24,
    detailMergeTolerance: 12,
    rareLimit: 5,
    dominantBucketSize: 28,
    structureMaxCoverage: 0.4,
    structureMinSpan: 5,
    structureCrossSpan: 2,
    structureBlendBoost: 0.14,
  },
  {
    name: "p6-detail-safe",
    fftStrength: 28,
    pixelLineThreshold: 0.13,
    pixelDetailThreshold: 0.17,
    cellLineThreshold: 0.23,
    cellDetailThreshold: 0.15,
    minCoverage: 0.01,
    maxCoverage: 0.14,
    blendMin: 0.6,
    blendMax: 0.82,
    normalMergeTolerance: 22,
    detailMergeTolerance: 12,
    rareLimit: 4,
    dominantBucketSize: 24,
    structureMaxCoverage: 0.36,
    structureMinSpan: 4,
    structureCrossSpan: 2,
    structureBlendBoost: 0.18,
  },
];

async function main() {
  const imagePath = process.argv[2] ?? DEFAULT_IMAGE_PATH;
  const requestedGridWidth = Number(process.argv[3] ?? DEFAULT_GRID_WIDTH);
  const gridWidth =
    Number.isFinite(requestedGridWidth) && requestedGridWidth > 0
      ? Math.round(requestedGridWidth)
      : DEFAULT_GRID_WIDTH;
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const raster = loadRasterWithPowerShell(imagePath);
  const gridHeight = Math.max(1, Math.round((raster.height / raster.width) * gridWidth));
  const cropped = centerCropToRatio(raster, gridWidth / gridHeight);
  const results: ExperimentResult[] = [];

  for (const preset of PRESETS) {
    const fftEnhanced = (await enhanceEdgesWithFftWasm(cropped, preset.fftStrength)) as RasterImage;
    const summary = runPreset(cropped, fftEnhanced, gridWidth, gridHeight, preset);
    results.push({
      name: preset.name,
      fftStrength: preset.fftStrength,
      ...summary,
    });
    console.log(
      JSON.stringify({
        preset: preset.name,
        fftStrength: preset.fftStrength,
        detailRatio: Number(summary.detailRatio.toFixed(4)),
        structureRatio: Number(summary.structureRatio.toFixed(4)),
        uniqueColors: summary.uniqueColors,
      }),
    );
  }

  const focusRect = buildFocusRect(gridWidth, gridHeight);

  const payload = {
    imagePath,
    fileName: basename(imagePath),
    gridWidth,
    gridHeight,
    focusRect,
    presets: results,
  };
  const summaryPath = join(OUTPUT_DIR, "results.json");
  await writeFile(summaryPath, JSON.stringify(payload, null, 2));
  renderArtifacts(payload, OUTPUT_DIR);
}

function runPreset(
  source: RasterImage,
  fftEnhanced: RasterImage,
  gridWidth: number,
  gridHeight: number,
  preset: Preset,
): MapSummary {
  const luma = buildLuma(source);
  const blurred = boxBlurLuma(luma, source.width, source.height);
  const fftLuma = buildLuma(fftEnhanced);
  const rawLine = new Float32Array(luma.length);
  const rawDetail = new Float32Array(luma.length);

  for (let index = 0; index < luma.length; index += 1) {
    rawLine[index] = Math.max(0, luma[index] - fftLuma[index]);
    rawDetail[index] = Math.max(0, luma[index] - blurred[index]);
  }

  const normalizedLine = normalizeMap(rawLine);
  const normalizedDetail = normalizeCombinedDetailMap(rawDetail, normalizedLine);
  const xEdges = buildEdges(source.width, gridWidth);
  const yEdges = buildEdges(source.height, gridHeight);
  const baseColors: Rgb[] = [];
  const boostedColors: Rgb[] = [];
  const detailCandidateColors: Array<Rgb | null> = [];
  const detailMask = new Uint8Array(gridWidth * gridHeight);
  const lineCells: number[] = [];
  const detailCells: number[] = [];
  const cellStats: CellStats[] = [];

  for (let row = 0; row < gridHeight; row += 1) {
    const top = yEdges[row];
    const bottom = Math.max(top + 1, yEdges[row + 1]);
    for (let column = 0; column < gridWidth; column += 1) {
      const left = xEdges[column];
      const right = Math.max(left + 1, xEdges[column + 1]);
      const cellIndex = row * gridWidth + column;
      const baseColor = sampleBaseColor(source, left, top, right, bottom, preset.dominantBucketSize);
      const stats = analyzeCell(
        source,
        normalizedLine,
        normalizedDetail,
        left,
        top,
        right,
        bottom,
        preset,
      );
      baseColors[cellIndex] = baseColor;
      lineCells[cellIndex] = Math.round(stats.lineScore * 255);
      detailCells[cellIndex] = Math.round(stats.detailScore * 255);
      detailCandidateColors[cellIndex] = stats.detailColor;
      const detailColorIsDistinctEnough =
        stats.detailColor !== null &&
        (rgbToLuma(stats.detailColor) <= rgbToLuma(baseColor) - 4 ||
          oklabDistance(rgbToOklab(stats.detailColor), rgbToOklab(baseColor)) >= 18);
      cellStats[cellIndex] = {
        ...stats,
        detailColorDistinct: detailColorIsDistinctEnough,
      };
      const isLocalDetail =
        stats.candidateCount >= 1 &&
        stats.coverage >= preset.minCoverage &&
        stats.coverage <= preset.maxCoverage &&
        stats.lineScore >= preset.cellLineThreshold &&
        stats.detailScore >= preset.cellDetailThreshold &&
        detailColorIsDistinctEnough;
      if (!stats.detailColor || !isLocalDetail) {
        boostedColors[cellIndex] = baseColor;
        continue;
      }

      detailMask[cellIndex] = 1;
      boostedColors[cellIndex] = mixRgb(baseColor, stats.detailColor, preset.blendMin);
    }
  }

  const { structureMask, structureCells } = buildStructureMask(cellStats, gridWidth, gridHeight, preset);
  const cleanedMask = pruneDetailMask(detailMask, lineCells, detailCells, gridWidth, gridHeight);
  for (let index = 0; index < cleanedMask.length; index += 1) {
    const combinedMask = cleanedMask[index] === 1 || structureMask[index] === 1 ? 1 : 0;
    detailMask[index] = combinedMask;
    const detailColor = detailCandidateColors[index];
    if (combinedMask === 0 || !detailColor) {
      boostedColors[index] = baseColors[index];
      continue;
    }

    const stats = cellStats[index]!;
    const detailStrength = clamp01(
      ((stats.lineScore - preset.cellLineThreshold) / Math.max(0.001, 1 - preset.cellLineThreshold)) * 0.55 +
        ((stats.detailScore - preset.cellDetailThreshold) / Math.max(0.001, 1 - preset.cellDetailThreshold)) *
          0.45,
    );
    const structureStrength = structureCells[index] / 255;
    let blend = preset.blendMin + detailStrength * (preset.blendMax - preset.blendMin);
    if (structureMask[index] === 1) {
      blend += preset.structureBlendBoost * (0.35 + structureStrength * 0.65);
    }
    boostedColors[index] = mixRgb(baseColors[index], detailColor, Math.min(0.92, blend));
  }

  const mergedColors = mergeColorsByRegion(
    boostedColors,
    detailMask,
    gridWidth,
    gridHeight,
    preset.normalMergeTolerance,
    preset.detailMergeTolerance,
    preset.rareLimit,
  );
  const quantizedColors = quantizeColorsByGroup(mergedColors, detailMask, 16, 12);
  const finalColors = mergeColorsByRegion(
    quantizedColors,
    detailMask,
    gridWidth,
    gridHeight,
    preset.normalMergeTolerance + 2,
    preset.detailMergeTolerance + 1,
    preset.rareLimit + 1,
  );
  const uniqueCodes = new Set(finalColors.map(rgbToCode));

  return {
    lineCells,
    detailCells,
    structureCells,
    detailMask: Array.from(detailMask),
    structureMask: Array.from(structureMask),
    finalCells: finalColors.map(rgbToHex),
    detailRatio: Array.from(detailMask).reduce((sum, value) => sum + value, 0) / detailMask.length,
    structureRatio: Array.from(structureMask).reduce((sum, value) => sum + value, 0) / structureMask.length,
    uniqueColors: uniqueCodes.size,
  };
}

function analyzeCell(
  source: RasterImage,
  lineMap: Float32Array,
  detailMap: Float32Array,
  left: number,
  top: number,
  right: number,
  bottom: number,
  preset: Preset,
) {
  let visibleCount = 0;
  let candidateCount = 0;
  let lineSum = 0;
  let lineMax = 0;
  let detailSum = 0;
  let detailMax = 0;
  let detailWeightSum = 0;
  let detailRgbSum = [0, 0, 0];

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const pixelIndex = (y * source.width + x) * 4;
      if (source.data[pixelIndex + 3] < ALPHA_VISIBLE_THRESHOLD) {
        continue;
      }

      const index = y * source.width + x;
      const line = lineMap[index];
      const detail = detailMap[index];
      visibleCount += 1;
      lineSum += line;
      detailSum += detail;
      lineMax = Math.max(lineMax, line);
      detailMax = Math.max(detailMax, detail);

      if (line >= preset.pixelLineThreshold && detail >= preset.pixelDetailThreshold) {
        candidateCount += 1;
        const weight = 0.15 + line * 0.55 + detail * 0.85;
        detailWeightSum += weight;
        detailRgbSum[0] += source.data[pixelIndex] * weight;
        detailRgbSum[1] += source.data[pixelIndex + 1] * weight;
        detailRgbSum[2] += source.data[pixelIndex + 2] * weight;
      }
    }
  }

  if (visibleCount === 0) {
    return {
      lineScore: 0,
      detailScore: 0,
      coverage: 0,
      candidateCount: 0,
      visibleCount: 0,
      detailColor: null as Rgb | null,
    };
  }

  const coverage = candidateCount / visibleCount;
  const lineMean = lineSum / visibleCount;
  const detailMean = detailSum / visibleCount;
  const lineScore = lineMean * 0.58 + lineMax * 0.42;
  const detailScore = detailMean * 0.64 + detailMax * 0.36;

  return {
    lineScore,
    detailScore,
    coverage,
    candidateCount,
    visibleCount,
    detailColor:
      candidateCount >= 1 && detailWeightSum > 0
        ? ([
            clampToByte(detailRgbSum[0] / detailWeightSum),
            clampToByte(detailRgbSum[1] / detailWeightSum),
            clampToByte(detailRgbSum[2] / detailWeightSum),
          ] as Rgb)
        : null,
  };
}

function buildStructureMask(cells: CellStats[], gridWidth: number, gridHeight: number, preset: Preset) {
  const length = cells.length;
  const candidateMask = new Uint8Array(length);
  const structureMask = new Uint8Array(length);
  const structureScores = new Float32Array(length);
  const relaxedLineThreshold = preset.cellLineThreshold * 0.82;
  const relaxedDetailThreshold = preset.cellDetailThreshold * 0.78;
  const relaxedMinCoverage = Math.max(0.005, preset.minCoverage * 0.8);

  for (let index = 0; index < length; index += 1) {
    const cell = cells[index]!;
    const candidate =
      cell.detailColor !== null &&
      cell.detailColorDistinct &&
      cell.candidateCount >= 1 &&
      cell.coverage >= relaxedMinCoverage &&
      cell.coverage <= preset.structureMaxCoverage &&
      cell.lineScore >= relaxedLineThreshold &&
      cell.detailScore >= relaxedDetailThreshold;
    candidateMask[index] = candidate ? 1 : 0;
  }

  const majorForward = new Uint16Array(length);
  const majorBackward = new Uint16Array(length);
  const minorForward = new Uint16Array(length);
  const minorBackward = new Uint16Array(length);
  for (let row = 0; row < gridHeight; row += 1) {
    for (let column = 0; column < gridWidth; column += 1) {
      const index = row * gridWidth + column;
      if (candidateMask[index] === 0) {
        continue;
      }
      majorForward[index] = 1 + (row > 0 && column > 0 ? majorForward[index - gridWidth - 1]! : 0);
    }
    for (let column = gridWidth - 1; column >= 0; column -= 1) {
      const index = row * gridWidth + column;
      if (candidateMask[index] === 0) {
        continue;
      }
      minorForward[index] = 1 + (row > 0 && column + 1 < gridWidth ? minorForward[index - gridWidth + 1]! : 0);
    }
  }
  for (let row = gridHeight - 1; row >= 0; row -= 1) {
    for (let column = gridWidth - 1; column >= 0; column -= 1) {
      const index = row * gridWidth + column;
      if (candidateMask[index] === 0) {
        continue;
      }
      majorBackward[index] =
        1 + (row + 1 < gridHeight && column + 1 < gridWidth ? majorBackward[index + gridWidth + 1]! : 0);
    }
    for (let column = 0; column < gridWidth; column += 1) {
      const index = row * gridWidth + column;
      if (candidateMask[index] === 0) {
        continue;
      }
      minorBackward[index] =
        1 + (row + 1 < gridHeight && column > 0 ? minorBackward[index + gridWidth - 1]! : 0);
    }
  }

  const minimumSignal =
    (preset.cellLineThreshold * 0.56 + preset.cellDetailThreshold * 0.44) * 0.78;
  for (let index = 0; index < length; index += 1) {
    if (candidateMask[index] === 0) {
      continue;
    }

    const row = Math.floor(index / gridWidth);
    const column = index % gridWidth;
    let diagonalNeighbors = 0;
    let axialNeighbors = 0;
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const nx = column + dx;
      const ny = row + dy;
      if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) {
        continue;
      }
      diagonalNeighbors += candidateMask[ny * gridWidth + nx] ?? 0;
    }
    for (const [dx, dy] of [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ]) {
      const nx = column + dx;
      const ny = row + dy;
      if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) {
        continue;
      }
      axialNeighbors += candidateMask[ny * gridWidth + nx] ?? 0;
    }

    const cell = cells[index]!;
    const majorSpan = majorForward[index]! + majorBackward[index]! - 1;
    const minorSpan = minorForward[index]! + minorBackward[index]! - 1;
    const maxSpan = Math.max(majorSpan, minorSpan);
    const crossSpan = Math.min(majorSpan, minorSpan);
    const signal = cell.lineScore * 0.56 + cell.detailScore * 0.44;
    const signalScore = clamp01((signal - minimumSignal) / Math.max(0.001, 1 - minimumSignal));
    const spanScore = clamp01((maxSpan - (preset.structureMinSpan - 1)) / Math.max(2, preset.structureMinSpan + 1));
    const crossScore = clamp01(
      (crossSpan - (preset.structureCrossSpan - 1)) / Math.max(2, preset.structureCrossSpan + 1),
    );
    const diagonalBias = diagonalNeighbors / Math.max(1, diagonalNeighbors + axialNeighbors);
    const thickBandScore = clamp01(
      (cell.coverage - preset.maxCoverage) / Math.max(0.04, preset.structureMaxCoverage - preset.maxCoverage),
    );
    const structureScore = clamp01(
      spanScore * 0.42 +
        crossScore * 0.24 +
        diagonalBias * 0.16 +
        signalScore * 0.12 +
        thickBandScore * 0.16,
    );
    const isStructure =
      (maxSpan >= preset.structureMinSpan &&
        diagonalNeighbors >= 1 &&
        (diagonalNeighbors >= axialNeighbors || crossSpan >= preset.structureCrossSpan)) ||
      (crossSpan >= preset.structureCrossSpan && diagonalNeighbors >= 2);

    if (isStructure) {
      structureMask[index] = 1;
      structureScores[index] = structureScore;
    }
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const next = new Uint8Array(structureMask);
    for (let index = 0; index < length; index += 1) {
      if (next[index] === 1 || candidateMask[index] === 0) {
        continue;
      }

      const row = Math.floor(index / gridWidth);
      const column = index % gridWidth;
      const bridgeMajor =
        row > 0 &&
        column > 0 &&
        row + 1 < gridHeight &&
        column + 1 < gridWidth &&
        structureMask[index - gridWidth - 1] === 1 &&
        structureMask[index + gridWidth + 1] === 1;
      const bridgeMinor =
        row > 0 &&
        column + 1 < gridWidth &&
        row + 1 < gridHeight &&
        column > 0 &&
        structureMask[index - gridWidth + 1] === 1 &&
        structureMask[index + gridWidth - 1] === 1;
      if (!bridgeMajor && !bridgeMinor) {
        continue;
      }

      const cell = cells[index]!;
      if (
        cell.lineScore < preset.cellLineThreshold * 0.72 ||
        cell.detailScore < preset.cellDetailThreshold * 0.68 ||
        !cell.detailColorDistinct
      ) {
        continue;
      }

      next[index] = 1;
      structureScores[index] = Math.max(structureScores[index], 0.65);
    }
    structureMask.set(next);
  }

  return {
    structureMask,
    structureCells: Array.from(structureScores, (value) => Math.round(value * 255)),
  };
}

function sampleBaseColor(
  image: RasterImage,
  left: number,
  top: number,
  right: number,
  bottom: number,
  bucketSize: number,
): Rgb {
  const bucketStats = new Map<number, { weight: number; rgbSum: [number, number, number] }>();
  let meanWeight = 0;
  let meanRgbSum: [number, number, number] = [0, 0, 0];
  const centerX = (left + right - 1) * 0.5;
  const centerY = (top + bottom - 1) * 0.5;
  const maxDistance = Math.max(1, Math.hypot((right - left) * 0.5, (bottom - top) * 0.5));

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const pixelIndex = (y * image.width + x) * 4;
      const alpha = image.data[pixelIndex + 3];
      if (alpha < ALPHA_VISIBLE_THRESHOLD) {
        continue;
      }

      const distance = Math.hypot(x - centerX, y - centerY) / maxDistance;
      const weight = 1 - distance * 0.28;
      meanWeight += weight;
      meanRgbSum[0] += image.data[pixelIndex] * weight;
      meanRgbSum[1] += image.data[pixelIndex + 1] * weight;
      meanRgbSum[2] += image.data[pixelIndex + 2] * weight;

      const key = quantizeRgb(
        [image.data[pixelIndex], image.data[pixelIndex + 1], image.data[pixelIndex + 2]],
        bucketSize,
      );
      let bucket = bucketStats.get(key);
      if (!bucket) {
        bucket = { weight: 0, rgbSum: [0, 0, 0] };
        bucketStats.set(key, bucket);
      }
      bucket.weight += weight;
      bucket.rgbSum[0] += image.data[pixelIndex] * weight;
      bucket.rgbSum[1] += image.data[pixelIndex + 1] * weight;
      bucket.rgbSum[2] += image.data[pixelIndex + 2] * weight;
    }
  }

  if (meanWeight <= 0) {
    return [0, 0, 0];
  }

  const meanColor: Rgb = [
    clampToByte(meanRgbSum[0] / meanWeight),
    clampToByte(meanRgbSum[1] / meanWeight),
    clampToByte(meanRgbSum[2] / meanWeight),
  ];
  let dominantColor = meanColor;
  let dominantWeight = -1;
  for (const bucket of bucketStats.values()) {
    if (bucket.weight <= dominantWeight) {
      continue;
    }
    dominantWeight = bucket.weight;
    dominantColor = [
      clampToByte(bucket.rgbSum[0] / bucket.weight),
      clampToByte(bucket.rgbSum[1] / bucket.weight),
      clampToByte(bucket.rgbSum[2] / bucket.weight),
    ];
  }

  return mixRgb(meanColor, dominantColor, 0.58);
}

function mergeColorsByRegion(
  colors: Rgb[],
  detailMask: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  normalTolerance: number,
  detailTolerance: number,
  rareLimit: number,
) {
  let merged = mergeRareColorsGlobal(colors, detailMask, false, normalTolerance, rareLimit);
  merged = mergeRareColorsGlobal(merged, detailMask, true, detailTolerance, rareLimit);
  merged = mergeRareColorsNeighborhood(merged, detailMask, gridWidth, gridHeight, false, normalTolerance, rareLimit);
  merged = mergeRareColorsNeighborhood(merged, detailMask, gridWidth, gridHeight, true, detailTolerance, rareLimit);
  return merged;
}

function mergeRareColorsGlobal(
  colors: Rgb[],
  detailMask: Uint8Array,
  detailGroup: boolean,
  tolerance: number,
  rareLimit: number,
) {
  const counts = new Map<number, number>();
  for (let index = 0; index < colors.length; index += 1) {
    if ((detailMask[index] === 1) !== detailGroup) {
      continue;
    }
    const code = rgbToCode(colors[index]);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  const next = colors.map((color) => [...color] as Rgb);
  const oklabByCode = new Map<number, Oklab>();
  for (let index = 0; index < colors.length; index += 1) {
    if ((detailMask[index] === 1) !== detailGroup) {
      continue;
    }
    const currentCode = rgbToCode(colors[index]);
    const currentCount = counts.get(currentCode) ?? 0;
    if (currentCount === 0 || currentCount > rareLimit) {
      continue;
    }

    let bestCode = currentCode;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestCount = -1;
    for (const [candidateCode, candidateCount] of counts.entries()) {
      if (candidateCode === currentCode || candidateCount <= rareLimit) {
        continue;
      }
      const distance = oklabDistance(
        getOklabForCode(currentCode, oklabByCode),
        getOklabForCode(candidateCode, oklabByCode),
      );
      if (distance > tolerance) {
        continue;
      }
      if (distance < bestDistance || (distance === bestDistance && candidateCount > bestCount)) {
        bestCode = candidateCode;
        bestDistance = distance;
        bestCount = candidateCount;
      }
    }

    if (bestCode !== currentCode) {
      next[index] = codeToRgb(bestCode);
    }
  }
  return next;
}

function mergeRareColorsNeighborhood(
  colors: Rgb[],
  detailMask: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  detailGroup: boolean,
  tolerance: number,
  rareLimit: number,
) {
  const counts = new Map<number, number>();
  for (let index = 0; index < colors.length; index += 1) {
    if ((detailMask[index] === 1) !== detailGroup) {
      continue;
    }
    const code = rgbToCode(colors[index]);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  const next = colors.map((color) => [...color] as Rgb);
  const oklabByCode = new Map<number, Oklab>();
  for (let index = 0; index < colors.length; index += 1) {
    if ((detailMask[index] === 1) !== detailGroup) {
      continue;
    }
    const currentCode = rgbToCode(colors[index]);
    const currentCount = counts.get(currentCode) ?? 0;
    if (currentCount === 0 || currentCount > rareLimit) {
      continue;
    }

    const x = index % gridWidth;
    const y = Math.floor(index / gridWidth);
    const weights = new Map<number, number>();
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        const neighborX = x + dx;
        const neighborY = y + dy;
        if (neighborX < 0 || neighborY < 0 || neighborX >= gridWidth || neighborY >= gridHeight) {
          continue;
        }
        const neighborIndex = neighborY * gridWidth + neighborX;
        if ((detailMask[neighborIndex] === 1) !== detailGroup) {
          continue;
        }
        const neighborCode = rgbToCode(colors[neighborIndex]);
        if (neighborCode === currentCode) {
          continue;
        }
        const neighborCount = counts.get(neighborCode) ?? 0;
        if (neighborCount === 0) {
          continue;
        }
        const distance = oklabDistance(
          getOklabForCode(currentCode, oklabByCode),
          getOklabForCode(neighborCode, oklabByCode),
        );
        if (distance > tolerance) {
          continue;
        }
        const spatialWeight = dx === 0 || dy === 0 ? 1.25 : 1;
        weights.set(neighborCode, (weights.get(neighborCode) ?? 0) + spatialWeight * Math.max(1, neighborCount));
      }
    }

    let bestCode = currentCode;
    let bestWeight = 0;
    for (const [candidateCode, candidateWeight] of weights.entries()) {
      if (candidateWeight > bestWeight) {
        bestCode = candidateCode;
        bestWeight = candidateWeight;
      }
    }
    if (bestCode !== currentCode) {
      next[index] = codeToRgb(bestCode);
    }
  }
  return next;
}

function normalizeCombinedDetailMap(detail: Float32Array, line: Float32Array) {
  const normalizedDetail = normalizeMap(detail);
  const combined = new Float32Array(detail.length);
  for (let index = 0; index < detail.length; index += 1) {
    combined[index] = clamp01(normalizedDetail[index] * (0.25 + line[index] * 0.75));
  }
  return combined;
}

function normalizeMap(signal: Float32Array) {
  const values: number[] = [];
  for (let index = 0; index < signal.length; index += 1) {
    if (signal[index] > 0) {
      values.push(signal[index]);
    }
  }

  if (values.length === 0) {
    return new Float32Array(signal.length);
  }

  values.sort((left, right) => left - right);
  const p90 = percentile(values, 0.97);
  const normalized = new Float32Array(signal.length);
  const scale = p90 > 0 ? p90 : values[values.length - 1]!;
  for (let index = 0; index < signal.length; index += 1) {
    normalized[index] = clamp01(signal[index] / Math.max(scale, 0.001));
  }
  return normalized;
}

function percentile(values: number[], value: number) {
  if (values.length === 0) {
    return 0;
  }
  const position = (values.length - 1) * value;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return values[lower]!;
  }
  const ratio = position - lower;
  return values[lower]! * (1 - ratio) + values[upper]! * ratio;
}

function buildLuma(image: RasterImage) {
  const luma = new Float32Array(image.width * image.height);
  for (let index = 0; index < luma.length; index += 1) {
    const pixelIndex = index * 4;
    luma[index] =
      image.data[pixelIndex] * 0.299 +
      image.data[pixelIndex + 1] * 0.587 +
      image.data[pixelIndex + 2] * 0.114;
  }
  return luma;
}

function boxBlurLuma(luma: Float32Array, width: number, height: number) {
  const output = new Float32Array(luma.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let sampleY = Math.max(0, y - 1); sampleY <= Math.min(height - 1, y + 1); sampleY += 1) {
        for (let sampleX = Math.max(0, x - 1); sampleX <= Math.min(width - 1, x + 1); sampleX += 1) {
          sum += luma[sampleY * width + sampleX]!;
          count += 1;
        }
      }
      output[y * width + x] = sum / Math.max(count, 1);
    }
  }
  return output;
}

function boxBlurRaster(image: RasterImage) {
  const output = new Uint8ClampedArray(image.data.length);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      let redSum = 0;
      let greenSum = 0;
      let blueSum = 0;
      let alphaSum = 0;
      let count = 0;
      for (let sampleY = Math.max(0, y - 1); sampleY <= Math.min(image.height - 1, y + 1); sampleY += 1) {
        for (let sampleX = Math.max(0, x - 1); sampleX <= Math.min(image.width - 1, x + 1); sampleX += 1) {
          const index = (sampleY * image.width + sampleX) * 4;
          redSum += image.data[index];
          greenSum += image.data[index + 1];
          blueSum += image.data[index + 2];
          alphaSum += image.data[index + 3];
          count += 1;
        }
      }
      const targetIndex = (y * image.width + x) * 4;
      output[targetIndex] = clampToByte(redSum / Math.max(count, 1));
      output[targetIndex + 1] = clampToByte(greenSum / Math.max(count, 1));
      output[targetIndex + 2] = clampToByte(blueSum / Math.max(count, 1));
      output[targetIndex + 3] = clampToByte(alphaSum / Math.max(count, 1));
    }
  }
  return {
    width: image.width,
    height: image.height,
    data: output,
  };
}

function buildFocusRect(gridWidth: number, gridHeight: number) {
  const left = Math.floor(gridWidth * 0.14);
  const top = Math.floor(gridHeight * 0.08);
  const width = Math.max(1, Math.min(gridWidth - left, Math.ceil(gridWidth * 0.54)));
  const height = Math.max(1, Math.min(gridHeight - top, Math.ceil(gridHeight * 0.76)));
  return { left, top, width, height };
}

function centerCropToRatio(image: RasterImage, targetRatio: number) {
  const currentRatio = image.width / image.height;
  if (Math.abs(currentRatio - targetRatio) < 1e-6) {
    return image;
  }
  if (currentRatio > targetRatio) {
    const newWidth = Math.round(image.height * targetRatio);
    const left = Math.floor((image.width - newWidth) * 0.5);
    return cropRaster(image, left, 0, left + newWidth, image.height);
  }
  const newHeight = Math.round(image.width / targetRatio);
  const top = Math.floor((image.height - newHeight) * 0.5);
  return cropRaster(image, 0, top, image.width, top + newHeight);
}

function cropRaster(image: RasterImage, left: number, top: number, right: number, bottom: number) {
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = top + y;
    for (let x = 0; x < width; x += 1) {
      const sourceX = left + x;
      const sourceIndex = (sourceY * image.width + sourceX) * 4;
      const targetIndex = (y * width + x) * 4;
      data[targetIndex] = image.data[sourceIndex];
      data[targetIndex + 1] = image.data[sourceIndex + 1];
      data[targetIndex + 2] = image.data[sourceIndex + 2];
      data[targetIndex + 3] = image.data[sourceIndex + 3];
    }
  }
  return { width, height, data };
}

function buildEdges(total: number, segments: number) {
  return Array.from({ length: segments + 1 }, (_, index) =>
    Math.round((index / Math.max(segments, 1)) * total),
  );
}

function mixRgb(left: Rgb, right: Rgb, weight: number): Rgb {
  const clampedWeight = clamp01(weight);
  return [
    clampToByte(left[0] * (1 - clampedWeight) + right[0] * clampedWeight),
    clampToByte(left[1] * (1 - clampedWeight) + right[1] * clampedWeight),
    clampToByte(left[2] * (1 - clampedWeight) + right[2] * clampedWeight),
  ];
}

function quantizeColorsByGroup(
  colors: Rgb[],
  detailMask: Uint8Array,
  normalBucket: number,
  detailBucket: number,
) {
  return colors.map((color, index) => {
    const bucket = detailMask[index] === 1 ? detailBucket : normalBucket;
    return [
      clampToByte(Math.round(color[0] / bucket) * bucket),
      clampToByte(Math.round(color[1] / bucket) * bucket),
      clampToByte(Math.round(color[2] / bucket) * bucket),
    ] as Rgb;
  });
}

function quantizeRgb(rgb: Rgb, bucketSize: number) {
  const step = Math.max(1, bucketSize);
  const red = Math.floor(rgb[0] / step);
  const green = Math.floor(rgb[1] / step);
  const blue = Math.floor(rgb[2] / step);
  return (red << 16) | (green << 8) | blue;
}

function clampToByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function rgbToCode(rgb: Rgb) {
  return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
}

function codeToRgb(code: number): Rgb {
  return [(code >> 16) & 0xff, (code >> 8) & 0xff, code & 0xff];
}

function rgbToHex(rgb: Rgb) {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function rgbToLuma(rgb: Rgb) {
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
}

function pruneDetailMask(
  mask: Uint8Array,
  lineCells: number[],
  detailCells: number[],
  gridWidth: number,
  gridHeight: number,
) {
  let current = new Uint8Array(mask);
  for (let pass = 0; pass < 2; pass += 1) {
    const next = new Uint8Array(current);
    for (let index = 0; index < current.length; index += 1) {
      if (current[index] === 0) {
        continue;
      }

      const x = index % gridWidth;
      const y = Math.floor(index / gridWidth);
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) {
            continue;
          }
          neighbors += current[ny * gridWidth + nx] ?? 0;
        }
      }

      const strong = lineCells[index] >= 150 && detailCells[index] >= 108;
      const medium = lineCells[index] >= 125 && detailCells[index] >= 88;
      if (!strong && neighbors === 0) {
        next[index] = 0;
      } else if (!medium && neighbors <= 1) {
        next[index] = 0;
      }
    }
    current = next;
  }
  return current;
}

function getOklabForCode(code: number, cache: Map<number, Oklab>) {
  let cached = cache.get(code);
  if (cached) {
    return cached;
  }
  cached = rgbToOklab(codeToRgb(code));
  cache.set(code, cached);
  return cached;
}

function rgbToOklab(rgb: Rgb): Oklab {
  const [red, green, blue] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

function oklabDistance(left: Oklab, right: Oklab) {
  return Math.sqrt(
    (left.l - right.l) * (left.l - right.l) +
      (left.a - right.a) * (left.a - right.a) +
      (left.b - right.b) * (left.b - right.b),
  ) * 255;
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

function renderArtifacts(
  summary: {
    gridWidth: number;
    gridHeight: number;
    focusRect: { left: number; top: number; width: number; height: number };
    presets: ExperimentResult[];
  },
  outputDir: string,
) {
  const scale = 14;
  const focusScale = scale + 10;
  const gap = 20;

  for (const preset of summary.presets) {
    writeBmp(
      join(outputDir, `${preset.name}-final.bmp`),
      renderGridBitmap(summary.gridWidth, summary.gridHeight, preset.finalCells, "final", scale),
    );
    writeBmp(
      join(outputDir, `${preset.name}-line.bmp`),
      renderGridBitmap(summary.gridWidth, summary.gridHeight, preset.lineCells, "line", scale),
    );
    writeBmp(
      join(outputDir, `${preset.name}-detail.bmp`),
      renderGridBitmap(summary.gridWidth, summary.gridHeight, preset.detailCells, "detail", scale),
    );
    writeBmp(
      join(outputDir, `${preset.name}-structure.bmp`),
      renderGridBitmap(summary.gridWidth, summary.gridHeight, preset.structureCells, "structure", scale),
    );
    writeBmp(
      join(outputDir, `${preset.name}-focus.bmp`),
      renderFocusBitmap(summary, preset.finalCells, focusScale),
    );
  }

  const rowHeight = Math.max(summary.gridHeight * scale, summary.focusRect.height * focusScale) + gap;
  const width =
    summary.gridWidth * scale * 4 +
    summary.focusRect.width * focusScale +
    gap * 6;
  const height = rowHeight * summary.presets.length + gap;
  const bitmap = createBitmap(width, height);
  let offsetY = gap;
  for (const preset of summary.presets) {
    blitBitmap(bitmap, renderGridBitmap(summary.gridWidth, summary.gridHeight, preset.lineCells, "line", scale), gap, offsetY);
    blitBitmap(
      bitmap,
      renderGridBitmap(summary.gridWidth, summary.gridHeight, preset.detailCells, "detail", scale),
      gap * 2 + summary.gridWidth * scale,
      offsetY,
    );
    blitBitmap(
      bitmap,
      renderGridBitmap(summary.gridWidth, summary.gridHeight, preset.structureCells, "structure", scale),
      gap * 3 + summary.gridWidth * scale * 2,
      offsetY,
    );
    blitBitmap(
      bitmap,
      renderGridBitmap(summary.gridWidth, summary.gridHeight, preset.finalCells, "final", scale),
      gap * 4 + summary.gridWidth * scale * 3,
      offsetY,
    );
    blitBitmap(
      bitmap,
      renderFocusBitmap(summary, preset.finalCells, focusScale),
      gap * 5 + summary.gridWidth * scale * 4,
      offsetY,
    );
    offsetY += rowHeight;
  }
  writeBmp(join(outputDir, "contact-sheet.bmp"), bitmap);
}

function renderGridBitmap(
  gridWidth: number,
  gridHeight: number,
  cells: Array<string | number>,
  mode: "final" | "line" | "detail" | "structure",
  scale: number,
) {
  const bitmap = createBitmap(gridWidth * scale, gridHeight * scale);
  for (let row = 0; row < gridHeight; row += 1) {
    for (let column = 0; column < gridWidth; column += 1) {
      const index = row * gridWidth + column;
      const rgba = colorForCell(cells[index], mode);
      fillRect(bitmap, column * scale, row * scale, scale, scale, rgba);
    }
  }
  return bitmap;
}

function renderFocusBitmap(
  summary: {
    gridWidth: number;
    gridHeight: number;
    focusRect: { left: number; top: number; width: number; height: number };
  },
  cells: string[],
  scale: number,
) {
  const bitmap = createBitmap(summary.focusRect.width * scale, summary.focusRect.height * scale);
  for (let row = 0; row < summary.focusRect.height; row += 1) {
    for (let column = 0; column < summary.focusRect.width; column += 1) {
      const sourceIndex =
        (summary.focusRect.top + row) * summary.gridWidth + (summary.focusRect.left + column);
      fillRect(bitmap, column * scale, row * scale, scale, scale, colorForCell(cells[sourceIndex], "final"));
    }
  }
  return bitmap;
}

function colorForCell(
  cell: string | number | undefined,
  mode: "final" | "line" | "detail" | "structure",
): Rgb {
  if (mode === "final") {
    return hexToRgb(typeof cell === "string" ? cell : "#FFFFFF");
  }
  const level = Math.max(0, Math.min(255, Math.round(Number(cell ?? 0))));
  if (mode === "line") {
    return [level, level, level];
  }
  if (mode === "structure") {
    return [
      Math.max(0, Math.min(255, Math.round(30 + level * 0.18))),
      Math.max(0, Math.min(255, Math.round(18 + level * 0.55))),
      Math.max(0, Math.min(255, Math.round(36 + level * 0.88))),
    ];
  }
  return [
    Math.max(0, Math.min(255, Math.round(40 + level * 0.85))),
    Math.max(0, Math.min(255, Math.round(32 + level * 0.45))),
    Math.max(0, Math.min(255, Math.round(44 + level * 0.15))),
  ];
}

function hexToRgb(hex: string): Rgb {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
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

function blitBitmap(
  target: { width: number; height: number; data: Uint8ClampedArray },
  source: { width: number; height: number; data: Uint8ClampedArray },
  left: number,
  top: number,
) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceIndex = (y * source.width + x) * 4;
      const targetIndex = ((top + y) * target.width + (left + x)) * 4;
      target.data[targetIndex] = source.data[sourceIndex];
      target.data[targetIndex + 1] = source.data[sourceIndex + 1];
      target.data[targetIndex + 2] = source.data[sourceIndex + 2];
      target.data[targetIndex + 3] = source.data[sourceIndex + 3];
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
  output.writeUInt32LE(0, 46);
  output.writeUInt32LE(0, 50);

  let offset = 54;
  for (let row = bitmap.height - 1; row >= 0; row -= 1) {
    for (let column = 0; column < bitmap.width; column += 1) {
      const index = (row * bitmap.width + column) * 4;
      output[offset] = bitmap.data[index + 2];
      output[offset + 1] = bitmap.data[index + 1];
      output[offset + 2] = bitmap.data[index];
      output[offset + 3] = bitmap.data[index + 3];
      offset += 4;
    }
  }

  writeFileSync(filePath, output);
}

function renderArtifactsWithPowerShell(summaryPath: string, outputDir: string) {
  const escapedSummaryPath = summaryPath.replace(/'/g, "''");
  const escapedOutputDir = outputDir.replace(/'/g, "''");
  const command = `
Add-Type -AssemblyName System.Drawing
$summary = Get-Content -Raw '${escapedSummaryPath}' | ConvertFrom-Json
$outputDir = '${escapedOutputDir}'
$gridWidth = [int](@($summary.gridWidth)[0])
$gridHeight = [int](@($summary.gridHeight)[0])
$scale = 14
$gap = 20
$labelWidth = 220
$titleHeight = 26
$sectionGap = 16
$chestLeft = [int](@($summary.chestRect.left)[0])
$chestTop = [int](@($summary.chestRect.top)[0])
$chestWidth = [int](@($summary.chestRect.width)[0])
$chestHeight = [int](@($summary.chestRect.height)[0])

function Draw-Grid {
  param(
    [System.Drawing.Graphics]$Graphics,
    [int]$OffsetX,
    [int]$OffsetY,
    [object]$CellScale,
    [object[]]$Cells,
    [string]$Mode
  )

  $cellScaleInt = [int](@($CellScale)[0])

  for ($row = 0; $row -lt $gridHeight; $row++) {
    for ($col = 0; $col -lt $gridWidth; $col++) {
      $index = $row * $gridWidth + $col
      $value = $Cells[$index]
      if ($Mode -eq 'final') {
        $color = [System.Drawing.ColorTranslator]::FromHtml([string]$value)
      } elseif ($Mode -eq 'mask') {
        if ([int]$value -gt 0) {
          $color = [System.Drawing.Color]::FromArgb(255, 240, 98, 66)
        } else {
          $color = [System.Drawing.Color]::FromArgb(255, 248, 248, 248)
        }
      } else {
        $level = [Math]::Max(0, [Math]::Min(255, [int]$value))
        if ($Mode -eq 'detail') {
          $red = [Math]::Max(0, [Math]::Min(255, [int](40 + $level * 0.85)))
          $green = [Math]::Max(0, [Math]::Min(255, [int](32 + $level * 0.45)))
          $blue = [Math]::Max(0, [Math]::Min(255, [int](44 + $level * 0.15)))
          $color = [System.Drawing.Color]::FromArgb(255, $red, $green, $blue)
        } else {
          $color = [System.Drawing.Color]::FromArgb(255, $level, $level, $level)
        }
      }

      $brush = New-Object System.Drawing.SolidBrush($color)
      try {
        $Graphics.FillRectangle($brush, $OffsetX + $col * $cellScaleInt, $OffsetY + $row * $cellScaleInt, $cellScaleInt, $cellScaleInt)
      } finally {
        $brush.Dispose()
      }
    }
  }
}

function Save-Preview {
  param(
    [string]$FilePath,
    [object[]]$Cells,
    [string]$Mode,
    [object]$CellScale
  )

  $cellScaleInt = [int](@($CellScale)[0])
  $bitmap = New-Object System.Drawing.Bitmap($gridWidth * $cellScaleInt, $gridHeight * $cellScaleInt, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::White)
    Draw-Grid -Graphics $graphics -OffsetX 0 -OffsetY 0 -CellScale $cellScaleInt -Cells $Cells -Mode $Mode
    $bitmap.Save($FilePath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Save-Chest {
  param(
    [string]$FilePath,
    [object[]]$Cells,
    [object]$CellScale
  )

  $cellScaleInt = [int](@($CellScale)[0])
  $bitmap = New-Object System.Drawing.Bitmap($chestWidth * $cellScaleInt, $chestHeight * $cellScaleInt, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::White)
    for ($row = 0; $row -lt $chestHeight; $row++) {
      for ($col = 0; $col -lt $chestWidth; $col++) {
        $sourceIndex = ($chestTop + $row) * $gridWidth + ($chestLeft + $col)
        $color = [System.Drawing.ColorTranslator]::FromHtml([string]$Cells[$sourceIndex])
        $brush = New-Object System.Drawing.SolidBrush($color)
        try {
          $graphics.FillRectangle($brush, $col * $cellScaleInt, $row * $cellScaleInt, $cellScaleInt, $cellScaleInt)
        } finally {
          $brush.Dispose()
        }
      }
    }
    $bitmap.Save($FilePath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$rowHeight = ($gridHeight * $scale) + $sectionGap
$sheetWidth = $labelWidth + ($gridWidth * $scale * 3) + ($chestWidth * ($scale + 10)) + ($gap * 5)
$sheetHeight = ($rowHeight * $summary.presets.Count) + $titleHeight + 20
$sheet = New-Object System.Drawing.Bitmap($sheetWidth, $sheetHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($sheet)
$titleFont = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$bodyFont = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Regular)
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 24, 24, 24))
$mutedBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 92, 92, 92))

try {
  $graphics.Clear([System.Drawing.Color]::White)
  $y = 10
  foreach ($preset in $summary.presets) {
    $previewPath = Join-Path $outputDir ($preset.name + '-final.png')
    $linePath = Join-Path $outputDir ($preset.name + '-line.png')
    $detailPath = Join-Path $outputDir ($preset.name + '-detail.png')
    $maskPath = Join-Path $outputDir ($preset.name + '-mask.png')
    $chestPath = Join-Path $outputDir ($preset.name + '-chest.png')
    Save-Preview -FilePath $previewPath -Cells $preset.finalCells -Mode 'final' -CellScale $scale
    Save-Preview -FilePath $linePath -Cells $preset.lineCells -Mode 'line' -CellScale $scale
    Save-Preview -FilePath $detailPath -Cells $preset.detailCells -Mode 'detail' -CellScale $scale
    Save-Preview -FilePath $maskPath -Cells $preset.detailMask -Mode 'mask' -CellScale $scale
    Save-Chest -FilePath $chestPath -Cells $preset.finalCells -CellScale ($scale + 10)

    $graphics.DrawString([string]$preset.name, $titleFont, $textBrush, 10, $y)
    $metrics = 'fft=' + [string]$preset.fftStrength + '  detail=' + ([double]$preset.detailRatio).ToString('0.000') + '  colors=' + [string]$preset.uniqueColors
    $graphics.DrawString($metrics, $bodyFont, $mutedBrush, 10, $y + 18)

    Draw-Grid -Graphics $graphics -OffsetX $labelWidth -OffsetY $y -CellScale $scale -Cells $preset.lineCells -Mode 'line'
    Draw-Grid -Graphics $graphics -OffsetX ($labelWidth + $gridWidth * $scale + $gap) -OffsetY $y -CellScale $scale -Cells $preset.detailCells -Mode 'detail'
    Draw-Grid -Graphics $graphics -OffsetX ($labelWidth + $gridWidth * $scale * 2 + $gap * 2) -OffsetY $y -CellScale $scale -Cells $preset.finalCells -Mode 'final'

    $chestScale = $scale + 10
    for ($row = 0; $row -lt $chestHeight; $row++) {
      for ($col = 0; $col -lt $chestWidth; $col++) {
        $sourceIndex = ($chestTop + $row) * $gridWidth + ($chestLeft + $col)
        $color = [System.Drawing.ColorTranslator]::FromHtml([string]$preset.finalCells[$sourceIndex])
        $brush = New-Object System.Drawing.SolidBrush($color)
        try {
          $graphics.FillRectangle(
            $brush,
            $labelWidth + $gridWidth * $scale * 3 + $gap * 3 + $col * $chestScale,
            $y + $row * $chestScale,
            $chestScale,
            $chestScale
          )
        } finally {
          $brush.Dispose()
        }
      }
    }

    $y += $rowHeight
  }
  $sheet.Save((Join-Path $outputDir 'contact-sheet.png'), [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $titleFont.Dispose()
  $bodyFont.Dispose()
  $textBrush.Dispose()
  $mutedBrush.Dispose()
  $graphics.Dispose()
  $sheet.Dispose()
}
`.trim();

  const result = Bun.spawnSync({
    cmd: ["powershell", "-NoProfile", "-Command", command],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(Buffer.from(result.stderr).toString("utf8"));
  }
}

await main();
