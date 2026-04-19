import { measureHexDistance255, type EditableCell, type NormalizedCropRect } from "./chart-processor";

import type { ColorCount } from "./chart-processor";

export type GridAxis = "width" | "height";
export type EditTool = "paint" | "erase" | "pick" | "fill" | "pan" | "zoom" | "crop";

export interface CanvasCropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Failed to read image."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

export function getActiveAspectRatio(
  sourceSize: { width: number; height: number } | null,
  cropRect: NormalizedCropRect | null,
) {
  if (!sourceSize || sourceSize.width <= 0 || sourceSize.height <= 0) {
    return null;
  }

  if (!cropRect) {
    return sourceSize.width / sourceSize.height;
  }

  const cropWidth = sourceSize.width * cropRect.width;
  const cropHeight = sourceSize.height * cropRect.height;
  if (cropWidth <= 0 || cropHeight <= 0) {
    return sourceSize.width / sourceSize.height;
  }

  return cropWidth / cropHeight;
}

export function hasLargeAspectRatioMismatch(
  sourceAspectRatio: number,
  detectedAspectRatio: number,
) {
  if (
    !Number.isFinite(sourceAspectRatio) ||
    !Number.isFinite(detectedAspectRatio) ||
    sourceAspectRatio <= 0 ||
    detectedAspectRatio <= 0
  ) {
    return false;
  }

  const larger = Math.max(sourceAspectRatio, detectedAspectRatio);
  const smaller = Math.min(sourceAspectRatio, detectedAspectRatio);
  return larger / smaller >= 1.55;
}

export function combineNormalizedCropRects(
  outer: NormalizedCropRect | null,
  inner: NormalizedCropRect | null,
) {
  if (!outer) {
    return inner;
  }
  if (!inner) {
    return outer;
  }

  return {
    x: outer.x + inner.x * outer.width,
    y: outer.y + inner.y * outer.height,
    width: outer.width * inner.width,
    height: outer.height * inner.height,
  };
}

export async function loadImageMetadata(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const complexity = estimateImageComplexity(bitmap);
    return {
      width: bitmap.width,
      height: bitmap.height,
      complexity,
    };
  } finally {
    bitmap.close();
  }
}

export function estimateImageComplexity(bitmap: ImageBitmap) {
  const sampleMaxSide = 128;
  const scale = Math.min(1, sampleMaxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(8, Math.round(bitmap.width * scale));
  const height = Math.max(8, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return 52;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height).data;
  const grayscale = new Float32Array(width * height);
  let sum = 0;

  for (let index = 0; index < width * height; index += 1) {
    const pixelIndex = index * 4;
    const value =
      imageData[pixelIndex] * 0.299 +
      imageData[pixelIndex + 1] * 0.587 +
      imageData[pixelIndex + 2] * 0.114;
    grayscale[index] = value;
    sum += value;
  }

  const mean = sum / grayscale.length;
  let variance = 0;
  let edgeEnergy = 0;
  const bins = new Uint16Array(16);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const value = grayscale[index];
      const delta = value - mean;
      variance += delta * delta;
      bins[Math.min(15, Math.floor(value / 16))] += 1;

      if (x + 1 < width) {
        edgeEnergy += Math.abs(value - grayscale[index + 1]);
      }
      if (y + 1 < height) {
        edgeEnergy += Math.abs(value - grayscale[index + width]);
      }
    }
  }

  variance /= grayscale.length;
  const normalizedVariance = Math.min(1, Math.sqrt(variance) / 80);
  const normalizedEdges = Math.min(1, edgeEnergy / Math.max(1, (width * (height - 1) + height * (width - 1)) * 36));

  let entropy = 0;
  for (const count of bins) {
    if (count === 0) {
      continue;
    }
    const probability = count / grayscale.length;
    entropy -= probability * Math.log2(probability);
  }
  const normalizedEntropy = Math.min(1, entropy / 4);

  const score = normalizedEdges * 0.5 + normalizedVariance * 0.3 + normalizedEntropy * 0.2;
  return Math.max(30, Math.min(100, Math.round(30 + score * 70)));
}

export function cloneEditableCells(cells: EditableCell[]) {
  return cells.map((cell) => ({ ...cell }));
}

export function cellsEqual(left: EditableCell[], right: EditableCell[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (
      left[index]?.label !== right[index]?.label ||
      left[index]?.hex !== right[index]?.hex ||
      (left[index]?.source ?? null) !== (right[index]?.source ?? null)
    ) {
      return false;
    }
  }

  return true;
}

export function buildReplacementCell(
  selectedLabel: string,
  paletteOptions: Array<{ label: string; hex: string }>,
  tool: EditTool,
  emptySelectionLabel: string,
): EditableCell {
  if (tool === "erase" || selectedLabel === emptySelectionLabel) {
    return { label: null, hex: null, source: null };
  }

  const selected = paletteOptions.find((entry) => entry.label === selectedLabel);

  if (!selected) {
    return { label: null, hex: null, source: null };
  }

  return { label: selected.label, hex: selected.hex, source: "manual" };
}

export function replaceSingleCell(
  cells: EditableCell[],
  index: number,
  replacement: EditableCell,
) {
  return cells.map((cell, cellIndex) =>
    cellIndex === index ? { ...replacement } : { ...cell },
  );
}

export function replaceBrushArea(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
  index: number,
  replacement: EditableCell,
  brushSize: number,
) {
  const normalizedSize = Math.max(1, Math.min(24, Math.round(brushSize)));
  if (normalizedSize === 1) {
    return replaceSingleCell(cells, index, replacement);
  }

  const targetX = index % gridWidth;
  const targetY = Math.floor(index / gridWidth);
  const startX = targetX - Math.floor(normalizedSize / 2);
  const startY = targetY - Math.floor(normalizedSize / 2);
  const nextCells = cloneEditableCells(cells);

  for (let offsetY = 0; offsetY < normalizedSize; offsetY += 1) {
    for (let offsetX = 0; offsetX < normalizedSize; offsetX += 1) {
      const x = startX + offsetX;
      const y = startY + offsetY;
      if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) {
        continue;
      }

      nextCells[y * gridWidth + x] = { ...replacement };
    }
  }

  return nextCells;
}

export function replaceLabelAcrossCells(
  cells: EditableCell[],
  sourceLabel: string,
  replacement: EditableCell,
) {
  return cells.map((cell) =>
    cell.label === sourceLabel ? { ...replacement } : { ...cell },
  );
}

export function floodFillCells(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
  startIndex: number,
  replacement: EditableCell,
  threshold: number,
) {
  const startCell = cells[startIndex];
  if (!startCell) {
    return cells;
  }

  if (
    startCell.label === replacement.label &&
    startCell.hex === replacement.hex
  ) {
    return cells;
  }

  const nextCells = cloneEditableCells(cells);
  const visited = new Uint8Array(cells.length);
  const queue: number[] = [startIndex];
  visited[startIndex] = 1;

  while (queue.length > 0) {
    const currentIndex = queue.pop()!;
    const currentCell = cells[currentIndex];
    const distance = measureHexDistance255(startCell.hex, currentCell?.hex ?? null);
    if (distance > threshold) {
      continue;
    }

    nextCells[currentIndex] = { ...replacement };

    const x = currentIndex % gridWidth;
    const y = Math.floor(currentIndex / gridWidth);
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];

    for (const [neighborX, neighborY] of neighbors) {
      if (
        neighborX < 0 ||
        neighborY < 0 ||
        neighborX >= gridWidth ||
        neighborY >= gridHeight
      ) {
        continue;
      }

      const neighborIndex = neighborY * gridWidth + neighborX;
      if (visited[neighborIndex]) {
        continue;
      }
      visited[neighborIndex] = 1;
      queue.push(neighborIndex);
    }
  }

  return nextCells;
}

export function createCanvasCropRectFromCellIndices(
  anchorIndex: number,
  focusIndex: number,
  gridWidth: number,
): CanvasCropRect {
  const anchorColumn = anchorIndex % gridWidth;
  const anchorRow = Math.floor(anchorIndex / gridWidth);
  const focusColumn = focusIndex % gridWidth;
  const focusRow = Math.floor(focusIndex / gridWidth);
  const left = Math.min(anchorColumn, focusColumn);
  const right = Math.max(anchorColumn, focusColumn);
  const top = Math.min(anchorRow, focusRow);
  const bottom = Math.max(anchorRow, focusRow);

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

export function clampCanvasCropRect(
  cropRect: CanvasCropRect,
  gridWidth: number,
  gridHeight: number,
) {
  if (gridWidth <= 0 || gridHeight <= 0) {
    return null;
  }

  const left = Math.max(0, Math.min(gridWidth - 1, Math.floor(cropRect.left)));
  const top = Math.max(0, Math.min(gridHeight - 1, Math.floor(cropRect.top)));
  const maxWidth = gridWidth - left;
  const maxHeight = gridHeight - top;
  const width = Math.max(1, Math.min(maxWidth, Math.floor(cropRect.width)));
  const height = Math.max(1, Math.min(maxHeight, Math.floor(cropRect.height)));

  return { left, top, width, height };
}

export function isFullCanvasCropRect(
  cropRect: CanvasCropRect | null,
  gridWidth: number,
  gridHeight: number,
) {
  if (!cropRect) {
    return true;
  }

  return (
    cropRect.left === 0 &&
    cropRect.top === 0 &&
    cropRect.width === gridWidth &&
    cropRect.height === gridHeight
  );
}

export function cropEditableCells(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
  cropRect: CanvasCropRect,
) {
  const normalizedCropRect = clampCanvasCropRect(cropRect, gridWidth, gridHeight);
  if (!normalizedCropRect) {
    return {
      cells: cloneEditableCells(cells),
      gridWidth,
      gridHeight,
    };
  }

  if (isFullCanvasCropRect(normalizedCropRect, gridWidth, gridHeight)) {
    return {
      cells: cloneEditableCells(cells),
      gridWidth,
      gridHeight,
    };
  }

  const nextCells: EditableCell[] = [];
  for (let row = 0; row < normalizedCropRect.height; row += 1) {
    const sourceRow = normalizedCropRect.top + row;
    for (let column = 0; column < normalizedCropRect.width; column += 1) {
      const sourceColumn = normalizedCropRect.left + column;
      const sourceIndex = sourceRow * gridWidth + sourceColumn;
      nextCells.push({ ...(cells[sourceIndex] ?? { label: null, hex: null, source: null }) });
    }
  }

  return {
    cells: nextCells,
    gridWidth: normalizedCropRect.width,
    gridHeight: normalizedCropRect.height,
  };
}

export function summarizeMatchedColors(
  cells: EditableCell[],
  paletteOptions: Array<{ label: string; hex: string }>,
) {
  const counts = new Map<string, number>();
  for (const cell of cells) {
    if (!cell.label || !cell.hex) {
      continue;
    }
    counts.set(cell.label, (counts.get(cell.label) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      hex: paletteOptions.find((entry) => entry.label === label)?.hex ?? "#000000",
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function resolveMatchedColorsBase(
  processedColors: ColorCount[] | null | undefined,
  cells: EditableCell[],
  paletteOptions: Array<{ label: string; hex: string }>,
  preferProcessedColors: boolean,
) {
  if (preferProcessedColors && processedColors?.length) {
    return processedColors.map((entry) => ({ ...entry }));
  }

  return summarizeMatchedColors(cells, paletteOptions);
}

export function mergeDisplayMatchedColors(
  baseColors: Array<{ label: string; count: number; hex: string }>,
  renderedColors: Array<{ label: string; count: number; hex: string }>,
) {
  const renderedMap = new Map(renderedColors.map((entry) => [entry.label, entry]));
  const merged: Array<{ label: string; count: number; hex: string }> = [];
  const seen = new Set<string>();

  for (const entry of baseColors) {
    const rendered = renderedMap.get(entry.label);
    merged.push({
      label: entry.label,
      count: rendered?.count ?? 0,
      hex: rendered?.hex ?? entry.hex,
    });
    seen.add(entry.label);
  }

  for (const entry of renderedColors) {
    if (seen.has(entry.label)) {
      continue;
    }
    merged.push(entry);
  }

  return merged;
}

export function getMatchedCoveragePercent(
  baseColors: Array<{ label: string; count: number; hex: string }>,
  disabledLabels: string[],
) {
  const totalCount = baseColors.length;
  if (totalCount <= 0) {
    return 100;
  }

  const disabledSet = new Set(disabledLabels);
  const activeCount = baseColors.reduce((sum, entry) => sum + (disabledSet.has(entry.label) ? 0 : 1), 0);
  return Math.max(0, Math.min(100, Math.round((activeCount / totalCount) * 100)));
}

export function buildDisabledLabelsByCoverage(
  baseColors: Array<{ label: string; count: number; hex: string }>,
  targetPercent: number,
) {
  if (baseColors.length <= 1) {
    return [];
  }

  const clampedPercent = Math.max(0, Math.min(100, targetPercent));
  if (clampedPercent >= 100) {
    return [];
  }

  const totalCount = baseColors.length;
  if (totalCount <= 0) {
    return [];
  }

  const targetActiveCount = Math.max(1, Math.round((totalCount * clampedPercent) / 100));
  const sortedColors = [...baseColors].sort(
    (left, right) => left.count - right.count || left.label.localeCompare(right.label),
  );

  const disabledLabels: string[] = [];
  let remainingColorCount = sortedColors.length;

  for (const entry of sortedColors) {
    if (remainingColorCount <= 1) {
      break;
    }
    if (remainingColorCount - 1 < targetActiveCount) {
      break;
    }

    disabledLabels.push(entry.label);
    remainingColorCount -= 1;
  }

  return disabledLabels;
}

export function getRenderedEditableCells(
  cells: EditableCell[],
  disabledLabels: string[],
  paletteOptions: Array<{ label: string; hex: string }>,
) {
  if (!cells.length) {
    return [];
  }

  if (!disabledLabels.length) {
    return cloneEditableCells(cells);
  }

  return applyDisabledColorReplacements(cells, disabledLabels, paletteOptions);
}

export function applyDisabledColorReplacements(
  cells: EditableCell[],
  disabledLabels: string[],
  paletteOptions: Array<{ label: string; hex: string }>,
) {
  if (!disabledLabels.length) {
    return cloneEditableCells(cells);
  }

  const paletteMap = new Map(paletteOptions.map((entry) => [entry.label, entry.hex]));
  const usedLabels = summarizeMatchedColors(cells, paletteOptions).map((entry) => entry.label);
  const activeUsedLabels = usedLabels.filter((label) => !disabledLabels.includes(label));
  const replacementMap = new Map<string, EditableCell>();

  for (const disabledLabel of disabledLabels) {
    const disabledHex = paletteMap.get(disabledLabel) ?? null;
    const replacement = findReplacementColor(
      disabledLabel,
      disabledHex,
      activeUsedLabels,
      paletteMap,
    );
    if (replacement) {
      replacementMap.set(disabledLabel, replacement);
    }
  }

  return cells.map((cell) => {
    if (!cell.label) {
      return { ...cell };
    }
    if (cell.source === "manual") {
      return { ...cell };
    }
    const replacement = replacementMap.get(cell.label);
    return replacement ? { ...replacement } : { ...cell };
  });
}

export function findReplacementColor(
  disabledLabel: string,
  disabledHex: string | null,
  activeUsedLabels: string[],
  paletteMap: Map<string, string>,
) {
  let best: EditableCell | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const label of activeUsedLabels) {
    if (label === disabledLabel) {
      continue;
    }

    const hex = paletteMap.get(label) ?? null;
    const distance = measureHexDistance255(disabledHex, hex);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { label, hex };
    }
  }

  return best;
}

