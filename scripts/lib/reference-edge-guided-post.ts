import type { EditableCell } from "../../src/lib/chart-processor";

export type Rgb = [number, number, number];

export interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface GuidedEdgeDarkenOptions {
  activationThreshold: number;
  minDarken: number;
  minSupport: number;
  supportThreshold?: number;
  allowBackgroundExpansion?: boolean;
  boundaryMask?: Uint8Array | null;
  maxCandidateLuma?: number;
}

export interface GuidedEdgeDarkenResult {
  cells: EditableCell[];
  selectedIndices: number[];
}

export interface HysteresisEdgeSelectionOptions {
  highThreshold: number;
  lowThreshold: number;
  minDarken: number;
  allowBackgroundExpansion?: boolean;
  boundaryMask?: Uint8Array | null;
  maxCandidateLuma?: number;
}

export function projectSourceEdgeActivation(
  original: RasterImage,
  enhanced: RasterImage,
  gridWidth: number,
  gridHeight: number,
) {
  if (
    original.width !== enhanced.width ||
    original.height !== enhanced.height ||
    original.data.length !== enhanced.data.length ||
    gridWidth <= 0 ||
    gridHeight <= 0
  ) {
    return new Float32Array(Math.max(0, gridWidth * gridHeight));
  }

  const activation = new Float32Array(gridWidth * gridHeight);
  const xEdges = buildEdges(original.width, gridWidth);
  const yEdges = buildEdges(original.height, gridHeight);

  for (let row = 0; row < gridHeight; row += 1) {
    const top = yEdges[row]!;
    const bottom = Math.max(top + 1, yEdges[row + 1]!);
    for (let column = 0; column < gridWidth; column += 1) {
      const left = xEdges[column]!;
      const right = Math.max(left + 1, xEdges[column + 1]!);
      const deltas: number[] = [];

      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const delta = Math.max(0, pixelLuma(original, x, y) - pixelLuma(enhanced, x, y));
          if (delta > 0.5) {
            deltas.push(delta);
          }
        }
      }

      if (deltas.length === 0) {
        continue;
      }

      deltas.sort((a, b) => b - a);
      const headCount = Math.max(1, Math.ceil(deltas.length * 0.2));
      let headSum = 0;
      let totalSum = 0;
      for (let index = 0; index < deltas.length; index += 1) {
        const value = deltas[index]!;
        totalSum += value;
        if (index < headCount) {
          headSum += value;
        }
      }

      const headMean = headSum / headCount;
      const coverage = deltas.length / Math.max(1, (right - left) * (bottom - top));
      const coverageWeight = 0.55 + Math.min(0.45, coverage * 2.5);
      activation[row * gridWidth + column] = headMean * coverageWeight;
    }
  }

  return activation;
}

export function projectSourceEdgeGradientActivation(
  original: RasterImage,
  enhanced: RasterImage,
  gridWidth: number,
  gridHeight: number,
) {
  if (
    original.width !== enhanced.width ||
    original.height !== enhanced.height ||
    original.data.length !== enhanced.data.length ||
    gridWidth <= 0 ||
    gridHeight <= 0
  ) {
    return new Float32Array(Math.max(0, gridWidth * gridHeight));
  }

  const originalLuma = buildLuma(original);
  const enhancedLuma = buildLuma(enhanced);
  const activationPixels = new Float32Array(original.width * original.height);

  for (let y = 1; y < original.height - 1; y += 1) {
    for (let x = 1; x < original.width - 1; x += 1) {
      const index = y * original.width + x;
      const originalGradient = sobelMagnitude(originalLuma, original.width, x, y);
      const enhancedGradient = sobelMagnitude(enhancedLuma, original.width, x, y);
      const darkening = Math.max(0, originalLuma[index]! - enhancedLuma[index]!);
      const gradientGain = Math.max(0, enhancedGradient - originalGradient);
      activationPixels[index] = gradientGain * (0.4 + Math.min(0.6, darkening / 64));
    }
  }

  return projectActivationPixels(activationPixels, original.width, original.height, gridWidth, gridHeight);
}

export function applyGuidedEdgeDarkening(
  baseCells: EditableCell[],
  edgeCells: EditableCell[],
  activation: Float32Array,
  gridWidth: number,
  gridHeight: number,
  options: GuidedEdgeDarkenOptions,
): GuidedEdgeDarkenResult {
  const next = baseCells.map((cell) => ({ ...cell }));
  const selectedIndices: number[] = [];
  const supportThreshold = options.supportThreshold ?? Math.max(1, options.activationThreshold * 0.65);
  const supportDarken = Math.max(4, options.minDarken * 0.35);

  for (let index = 0; index < next.length; index += 1) {
    if ((activation[index] ?? 0) < options.activationThreshold) {
      continue;
    }
    if (options.boundaryMask && !options.boundaryMask[index]) {
      continue;
    }

    const baseCell = next[index]!;
    const candidateCell = edgeCells[index];
    if (!candidateCell) {
      continue;
    }

    const baseRgb = cellToRgb(baseCell);
    const candidateRgb = cellToRgb(candidateCell);
    if (rgbLuma(candidateRgb) > rgbLuma(baseRgb) - options.minDarken) {
      continue;
    }
    if (
      options.maxCandidateLuma !== undefined &&
      rgbLuma(candidateRgb) > options.maxCandidateLuma
    ) {
      continue;
    }

    if (
      !options.allowBackgroundExpansion &&
      !isOccupied(baseRgb) &&
      !hasOccupiedNeighbor(baseCells, gridWidth, gridHeight, index)
    ) {
      continue;
    }

    let support = 0;
    const x = index % gridWidth;
    const y = Math.floor(index / gridWidth);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextY < 0 || nextX >= gridWidth || nextY >= gridHeight) {
          continue;
        }
        const neighborIndex = nextY * gridWidth + nextX;
        if ((activation[neighborIndex] ?? 0) < supportThreshold) {
          continue;
        }
        const neighborBase = baseCells[neighborIndex];
        const neighborCandidate = edgeCells[neighborIndex];
        if (!neighborBase || !neighborCandidate) {
          continue;
        }
        if (rgbLuma(cellToRgb(neighborCandidate)) <= rgbLuma(cellToRgb(neighborBase)) - supportDarken) {
          support += 1;
        }
      }
    }

    if (support < options.minSupport) {
      continue;
    }

    next[index] = {
      ...candidateCell,
      source: "detected",
    };
    selectedIndices.push(index);
  }

  return { cells: next, selectedIndices };
}

export function expandGuidedSelectionByHysteresis(
  baseCells: EditableCell[],
  edgeCells: EditableCell[],
  activation: Float32Array,
  gridWidth: number,
  gridHeight: number,
  options: HysteresisEdgeSelectionOptions,
) {
  const selected = new Uint8Array(baseCells.length);
  const queue: number[] = [];

  for (let index = 0; index < baseCells.length; index += 1) {
    if ((activation[index] ?? 0) < options.highThreshold) {
      continue;
    }
    if (!isEligibleGuidedIndex(baseCells, edgeCells, activation, gridWidth, gridHeight, index, {
      activationThreshold: options.highThreshold,
      minDarken: options.minDarken,
      minSupport: 0,
      allowBackgroundExpansion: options.allowBackgroundExpansion,
      boundaryMask: options.boundaryMask,
      maxCandidateLuma: options.maxCandidateLuma,
    })) {
      continue;
    }
    selected[index] = 1;
    queue.push(index);
  }

  while (queue.length > 0) {
    const index = queue.shift()!;
    const x = index % gridWidth;
    const y = Math.floor(index / gridWidth);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        const nextX = x + dx;
        const nextY = y + dy;
        if (nextX < 0 || nextY < 0 || nextX >= gridWidth || nextY >= gridHeight) {
          continue;
        }
        const neighborIndex = nextY * gridWidth + nextX;
        if (selected[neighborIndex]) {
          continue;
        }
        if ((activation[neighborIndex] ?? 0) < options.lowThreshold) {
          continue;
        }
        if (!isEligibleGuidedIndex(baseCells, edgeCells, activation, gridWidth, gridHeight, neighborIndex, {
          activationThreshold: options.lowThreshold,
          minDarken: options.minDarken,
          minSupport: 0,
          allowBackgroundExpansion: options.allowBackgroundExpansion,
          boundaryMask: options.boundaryMask,
          maxCandidateLuma: options.maxCandidateLuma,
        })) {
          continue;
        }
        selected[neighborIndex] = 1;
        queue.push(neighborIndex);
      }
    }
  }

  return Array.from(selected.entries())
    .filter(([, value]) => value > 0)
    .map(([index]) => index);
}

export function buildCellBoundaryMask(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
  contrastThreshold = 16,
) {
  const mask = new Uint8Array(cells.length);
  for (let index = 0; index < cells.length; index += 1) {
    const baseRgb = cellToRgb(cells[index]!);
    const x = index % gridWidth;
    const y = Math.floor(index / gridWidth);
    let boundary = false;

    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX < 0 || nextY < 0 || nextX >= gridWidth || nextY >= gridHeight) {
        boundary = true;
        break;
      }
      const neighbor = cellToRgb(cells[nextY * gridWidth + nextX]!);
      if (isOccupied(baseRgb) !== isOccupied(neighbor)) {
        boundary = true;
        break;
      }
      if (rgbLuma(neighbor) >= rgbLuma(baseRgb) + contrastThreshold) {
        boundary = true;
        break;
      }
    }

    if (boundary) {
      mask[index] = 1;
    }
  }
  return mask;
}

export function pickDominantDarkCell(
  cells: EditableCell[],
  candidateIndices: number[],
  maxLuma = 110,
) {
  const counts = new Map<string, { count: number; cell: EditableCell }>();

  for (const index of candidateIndices) {
    const cell = cells[index];
    if (!cell?.label || !cell.hex) {
      continue;
    }
    if (rgbLuma(cellToRgb(cell)) > maxLuma) {
      continue;
    }
    const key = `${cell.label}:${cell.hex}`;
    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { count: 1, cell });
    }
  }

  let best: { count: number; cell: EditableCell } | null = null;
  for (const value of counts.values()) {
    if (!best || value.count > best.count) {
      best = value;
    }
  }
  return best?.cell ?? null;
}

export function cellToRgb(cell: Pick<EditableCell, "hex">): Rgb {
  if (!cell.hex) {
    return [255, 255, 255];
  }
  const hex = cell.hex.replace(/^#/, "");
  if (hex.length !== 6) {
    return [255, 255, 255];
  }
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

export function rgbLuma(rgb: Rgb) {
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
}

export function isOccupied(rgb: Rgb) {
  return rgbLuma(rgb) < 242;
}

function buildEdges(size: number, divisions: number) {
  return Array.from({ length: divisions + 1 }, (_, index) =>
    Math.min(size, Math.round((index / divisions) * size)),
  );
}

function buildLuma(image: RasterImage) {
  const luma = new Float32Array(image.width * image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      luma[y * image.width + x] = pixelLuma(image, x, y);
    }
  }
  return luma;
}

function projectActivationPixels(
  activationPixels: Float32Array,
  width: number,
  height: number,
  gridWidth: number,
  gridHeight: number,
) {
  const activation = new Float32Array(gridWidth * gridHeight);
  const xEdges = buildEdges(width, gridWidth);
  const yEdges = buildEdges(height, gridHeight);

  for (let row = 0; row < gridHeight; row += 1) {
    const top = yEdges[row]!;
    const bottom = Math.max(top + 1, yEdges[row + 1]!);
    for (let column = 0; column < gridWidth; column += 1) {
      const left = xEdges[column]!;
      const right = Math.max(left + 1, xEdges[column + 1]!);
      const values: number[] = [];
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const value = activationPixels[y * width + x] ?? 0;
          if (value > 0.25) {
            values.push(value);
          }
        }
      }
      if (values.length === 0) {
        continue;
      }
      values.sort((a, b) => b - a);
      const headCount = Math.max(1, Math.ceil(values.length * 0.15));
      let headSum = 0;
      for (let index = 0; index < headCount; index += 1) {
        headSum += values[index]!;
      }
      activation[row * gridWidth + column] = headSum / headCount;
    }
  }

  return activation;
}

function sobelMagnitude(luma: Float32Array, width: number, x: number, y: number) {
  const topLeft = luma[(y - 1) * width + (x - 1)] ?? 0;
  const top = luma[(y - 1) * width + x] ?? 0;
  const topRight = luma[(y - 1) * width + (x + 1)] ?? 0;
  const left = luma[y * width + (x - 1)] ?? 0;
  const right = luma[y * width + (x + 1)] ?? 0;
  const bottomLeft = luma[(y + 1) * width + (x - 1)] ?? 0;
  const bottom = luma[(y + 1) * width + x] ?? 0;
  const bottomRight = luma[(y + 1) * width + (x + 1)] ?? 0;
  const gx = -topLeft - 2 * left - bottomLeft + topRight + 2 * right + bottomRight;
  const gy = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight;
  return Math.sqrt(gx * gx + gy * gy);
}

function pixelLuma(image: RasterImage, x: number, y: number) {
  const index = (y * image.width + x) * 4;
  return image.data[index]! * 0.299 + image.data[index + 1]! * 0.587 + image.data[index + 2]! * 0.114;
}

function hasOccupiedNeighbor(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
  index: number,
) {
  const x = index % gridWidth;
  const y = Math.floor(index / gridWidth);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX < 0 || nextY < 0 || nextX >= gridWidth || nextY >= gridHeight) {
        continue;
      }
      if (isOccupied(cellToRgb(cells[nextY * gridWidth + nextX]!))) {
        return true;
      }
    }
  }
  return false;
}

function isEligibleGuidedIndex(
  baseCells: EditableCell[],
  edgeCells: EditableCell[],
  activation: Float32Array,
  gridWidth: number,
  gridHeight: number,
  index: number,
  options: GuidedEdgeDarkenOptions,
) {
  if ((activation[index] ?? 0) < options.activationThreshold) {
    return false;
  }
  if (options.boundaryMask && !options.boundaryMask[index]) {
    return false;
  }

  const baseCell = baseCells[index];
  const candidateCell = edgeCells[index];
  if (!baseCell || !candidateCell) {
    return false;
  }

  const baseRgb = cellToRgb(baseCell);
  const candidateRgb = cellToRgb(candidateCell);
  if (rgbLuma(candidateRgb) > rgbLuma(baseRgb) - options.minDarken) {
    return false;
  }
  if (
    options.maxCandidateLuma !== undefined &&
    rgbLuma(candidateRgb) > options.maxCandidateLuma
  ) {
    return false;
  }
  if (
    !options.allowBackgroundExpansion &&
    !isOccupied(baseRgb) &&
    !hasOccupiedNeighbor(baseCells, gridWidth, gridHeight, index)
  ) {
    return false;
  }

  return true;
}
