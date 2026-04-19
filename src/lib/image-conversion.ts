export interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

type Rgb = [number, number, number];
type Oklab = [number, number, number];

export interface ImageStyleProfile {
  samplingBlend: number;
  ditherStrength: number;
  cleanupTolerance: number;
  cleanupPasses: number;
}

export interface StylizeLogicalRasterOptions {
  cleanupTolerance: number;
  cleanupPasses: number;
  protectedMask?: Uint8Array | null;
}

export interface MergeSmallColorClustersOptions {
  tolerance: number;
  protectedMask?: Uint8Array | null;
  maxClusterSize?: number;
  preserveSmallSimilarNeighbors?: boolean;
}

const MIN_VISIBLE_PIXEL_ALPHA = 8;

export function buildImageStyleProfile(renderStyleBias: number): ImageStyleProfile {
  const clamped = Math.max(0, Math.min(100, renderStyleBias));
  const legacyEquivalent = Math.min(100, (clamped / 75) * 100);
  const extraCleanupFactor = clamped <= 75 ? 0 : (clamped - 75) / 25;
  const samplingBlend = Math.min(legacyEquivalent / 50, 1);
  const ditherStrength = legacyEquivalent >= 50 ? 0 : 1 - legacyEquivalent / 50;
  const cleanupFactor = legacyEquivalent <= 50 ? 0 : (legacyEquivalent - 50) / 50;
  return {
    samplingBlend,
    ditherStrength,
    cleanupTolerance: cleanupFactor * 24 + extraCleanupFactor * 18,
    cleanupPasses:
      cleanupFactor <= 0 && extraCleanupFactor <= 0
        ? 0
        : Math.max(1, Math.round(1 + cleanupFactor * 3 + extraCleanupFactor * 2)),
  };
}

export function sampleConvertedImageGrid(
  image: RasterImage,
  gridWidth: number,
  gridHeight: number,
  renderStyleBias: number,
) {
  const profile = buildImageStyleProfile(renderStyleBias);
  const xEdges = buildEdges(image.width, gridWidth);
  const yEdges = buildEdges(image.height, gridHeight);
  const data = new Uint8ClampedArray(gridWidth * gridHeight * 4);

  for (let row = 0; row < gridHeight; row += 1) {
    const top = yEdges[row]!;
    const bottom = Math.max(top + 1, yEdges[row + 1]!);
    for (let column = 0; column < gridWidth; column += 1) {
      const left = xEdges[column]!;
      const right = Math.max(left + 1, xEdges[column + 1]!);
      const realistic = weightedAveragePatch(image, left, top, right, bottom);
      const hybrid = sampleHybridPatch(image, left, top, right, bottom);
      const rgb = blendRgb(realistic.rgb, hybrid.rgb, profile.samplingBlend);
      const alpha = clampToByte(realistic.alpha * (1 - profile.samplingBlend) + hybrid.alpha * profile.samplingBlend);
      const offset = (row * gridWidth + column) * 4;
      data[offset] = rgb[0];
      data[offset + 1] = rgb[1];
      data[offset + 2] = rgb[2];
      data[offset + 3] = alpha;
    }
  }

  return {
    logical: { width: gridWidth, height: gridHeight, data },
    profile,
  };
}

export function stylizeLogicalRaster(
  image: RasterImage,
  options: StylizeLogicalRasterOptions,
) {
  if (options.cleanupTolerance <= 0 || options.cleanupPasses <= 0) {
    return cloneRaster(image);
  }

  let current = cloneRaster(image);
  for (let pass = 0; pass < options.cleanupPasses; pass += 1) {
    const protectionMask = buildLogicalProtectionMask(current, options.protectedMask);
    const next = new Uint8ClampedArray(current.data);
    let changed = false;

    for (let y = 0; y < current.height; y += 1) {
      for (let x = 0; x < current.width; x += 1) {
        const index = y * current.width + x;
        const pixelOffset = index * 4;
        if (current.data[pixelOffset + 3] < MIN_VISIBLE_PIXEL_ALPHA || protectionMask[index]) {
          continue;
        }

        const currentRgb = readRgb(current, x, y);
        const currentCode = rgbToCode(currentRgb);
        let sameCodeNeighborCount = 0;
        const clusterBuckets = new Map<number, { count: number; sum: [number, number, number] }>();

        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) {
              continue;
            }
            const neighborX = x + dx;
            const neighborY = y + dy;
            if (
              neighborX < 0 ||
              neighborY < 0 ||
              neighborX >= current.width ||
              neighborY >= current.height
            ) {
              continue;
            }
            const neighborOffset = (neighborY * current.width + neighborX) * 4;
            if (current.data[neighborOffset + 3] < MIN_VISIBLE_PIXEL_ALPHA) {
              continue;
            }

            const neighborRgb = readRgb(current, neighborX, neighborY);
            const code = rgbToCode(neighborRgb);
            if (code === currentCode) {
              sameCodeNeighborCount += 1;
            }
            const bucket = clusterBuckets.get(code) ?? { count: 0, sum: [0, 0, 0] };
            bucket.count += 1;
            bucket.sum[0] += neighborRgb[0];
            bucket.sum[1] += neighborRgb[1];
            bucket.sum[2] += neighborRgb[2];
            clusterBuckets.set(code, bucket);
          }
        }

        if (sameCodeNeighborCount >= 2) {
          continue;
        }

        let bestReplacement: Rgb | null = null;
        let bestCount = 0;
        for (const [code, bucket] of clusterBuckets) {
          if (bucket.count < 3) {
            continue;
          }
          const candidate = codeToRgb(code);
          if (rgbChannelDelta(currentRgb, candidate) > options.cleanupTolerance) {
            continue;
          }
          if (bucket.count > bestCount) {
            bestCount = bucket.count;
            bestReplacement = [
              clampToByte(bucket.sum[0] / bucket.count),
              clampToByte(bucket.sum[1] / bucket.count),
              clampToByte(bucket.sum[2] / bucket.count),
            ];
          }
        }

        if (!bestReplacement) {
          continue;
        }

        next[pixelOffset] = bestReplacement[0];
        next[pixelOffset + 1] = bestReplacement[1];
        next[pixelOffset + 2] = bestReplacement[2];
        changed = true;
      }
    }

    current = { width: current.width, height: current.height, data: next };
    const clustered = mergeSmallColorClusters(current, {
      tolerance: options.cleanupTolerance,
      protectedMask: protectionMask,
      maxClusterSize: Math.max(4, Math.round(2 + options.cleanupTolerance * 0.25)),
    });
    if (clustered !== current) {
      changed = true;
      current = clustered;
    }
    if (!changed) {
      break;
    }
  }

  return current;
}

export function mergeSmallColorClusters(
  image: RasterImage,
  options: MergeSmallColorClustersOptions,
) {
  const tolerance = Math.max(0, options.tolerance);
  if (tolerance <= 0 || image.width <= 0 || image.height <= 0) {
    return image;
  }

  const pixelCount = image.width * image.height;
  const codes = new Int32Array(pixelCount);
  const counts = new Map<number, number>();
  for (let index = 0; index < pixelCount; index += 1) {
    const pixelOffset = index * 4;
    if (image.data[pixelOffset + 3] < MIN_VISIBLE_PIXEL_ALPHA) {
      codes[index] = -1;
      continue;
    }
    const code =
      (image.data[pixelOffset] << 16) |
      (image.data[pixelOffset + 1] << 8) |
      image.data[pixelOffset + 2];
    codes[index] = code;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  const protectedMask =
    options.protectedMask && options.protectedMask.length === pixelCount
      ? options.protectedMask
      : null;
  const visited = new Uint8Array(pixelCount);
  const nextData = new Uint8ClampedArray(image.data);
  const maxClusterSize = Math.max(1, options.maxClusterSize ?? 4);
  const supportThreshold = Math.max(4, tolerance * 0.65);
  const oklabCache = new Map<number, Oklab>();
  let changed = false;

  function getCodeOklab(code: number) {
    let cached = oklabCache.get(code);
    if (cached) {
      return cached;
    }
    cached = rgbToOklab(codeToRgb(code));
    oklabCache.set(code, cached);
    return cached;
  }

  for (let index = 0; index < pixelCount; index += 1) {
    const currentCode = codes[index];
    if (currentCode < 0 || visited[index]) {
      continue;
    }

    const clusterIndices: number[] = [];
    const queue = [index];
    let queueIndex = 0;
    let touchesProtected = false;
    visited[index] = 1;

    while (queueIndex < queue.length) {
      const currentIndex = queue[queueIndex]!;
      queueIndex += 1;
      clusterIndices.push(currentIndex);
      if (protectedMask?.[currentIndex]) {
        touchesProtected = true;
      }

      const x = currentIndex % image.width;
      const y = Math.floor(currentIndex / image.width);
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const neighborX = x + dx;
        const neighborY = y + dy;
        if (
          neighborX < 0 ||
          neighborY < 0 ||
          neighborX >= image.width ||
          neighborY >= image.height
        ) {
          continue;
        }
        const neighborIndex = neighborY * image.width + neighborX;
        if (visited[neighborIndex] || codes[neighborIndex] !== currentCode) {
          continue;
        }
        visited[neighborIndex] = 1;
        queue.push(neighborIndex);
      }
    }

    if (touchesProtected || clusterIndices.length > maxClusterSize) {
      continue;
    }

    if (
      options.preserveSmallSimilarNeighbors &&
      hasSmallSupportingNeighborCluster(
        clusterIndices,
        currentCode,
        codes,
        counts,
        image.width,
        image.height,
        getCodeOklab,
        supportThreshold,
        Math.max(maxClusterSize * 2, 6),
      )
    ) {
      continue;
    }

    const currentOklab = getCodeOklab(currentCode);
    let bestCode = -1;
    let bestContact = -1;
    let bestCount = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    const seenCandidates = new Set<number>();

    for (const clusterIndex of clusterIndices) {
      const x = clusterIndex % image.width;
      const y = Math.floor(clusterIndex / image.width);
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const neighborX = x + dx;
        const neighborY = y + dy;
        if (
          neighborX < 0 ||
          neighborY < 0 ||
          neighborX >= image.width ||
          neighborY >= image.height
        ) {
          continue;
        }
        const neighborIndex = neighborY * image.width + neighborX;
        const neighborCode = codes[neighborIndex];
        if (
          neighborCode < 0 ||
          neighborCode === currentCode ||
          protectedMask?.[neighborIndex]
        ) {
          continue;
        }
        seenCandidates.add(neighborCode);
      }
    }

    for (const candidateCode of seenCandidates) {
      const candidateCount = counts.get(candidateCode) ?? 0;
      if (candidateCount < clusterIndices.length) {
        continue;
      }
      const distance =
        oklabDistance(currentOklab, getCodeOklab(candidateCode)) * 255;
      if (distance > tolerance) {
        continue;
      }

      let contact = 0;
      for (const clusterIndex of clusterIndices) {
        const x = clusterIndex % image.width;
        const y = Math.floor(clusterIndex / image.width);
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          const neighborX = x + dx;
          const neighborY = y + dy;
          if (
            neighborX < 0 ||
            neighborY < 0 ||
            neighborX >= image.width ||
            neighborY >= image.height
          ) {
            continue;
          }
          if (codes[neighborY * image.width + neighborX] === candidateCode) {
            contact += 1;
          }
        }
      }

      if (
        contact > bestContact ||
        (contact === bestContact && candidateCount > bestCount) ||
        (contact === bestContact && candidateCount === bestCount && distance < bestDistance)
      ) {
        bestCode = candidateCode;
        bestContact = contact;
        bestCount = candidateCount;
        bestDistance = distance;
      }
    }

    if (bestCode === -1 || bestContact <= 0) {
      continue;
    }

    const replacement = codeToRgb(bestCode);
    for (const clusterIndex of clusterIndices) {
      const pixelOffset = clusterIndex * 4;
      nextData[pixelOffset] = replacement[0];
      nextData[pixelOffset + 1] = replacement[1];
      nextData[pixelOffset + 2] = replacement[2];
      codes[clusterIndex] = bestCode;
    }
    counts.set(currentCode, Math.max(0, (counts.get(currentCode) ?? 0) - clusterIndices.length));
    counts.set(bestCode, (counts.get(bestCode) ?? 0) + clusterIndices.length);
    changed = true;
  }

  return changed
    ? {
        width: image.width,
        height: image.height,
        data: nextData,
      }
    : image;
}

function hasSmallSupportingNeighborCluster(
  clusterIndices: number[],
  currentCode: number,
  codes: Int32Array,
  counts: Map<number, number>,
  width: number,
  height: number,
  getCodeOklab: (code: number) => Oklab,
  threshold: number,
  maxSupportingCount: number,
) {
  const currentOklab = getCodeOklab(currentCode);
  for (const clusterIndex of clusterIndices) {
    const x = clusterIndex % width;
    const y = Math.floor(clusterIndex / width);
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const neighborX = x + dx;
      const neighborY = y + dy;
      if (neighborX < 0 || neighborY < 0 || neighborX >= width || neighborY >= height) {
        continue;
      }
      const neighborCode = codes[neighborY * width + neighborX];
      if (neighborCode < 0 || neighborCode === currentCode) {
        continue;
      }
      if ((counts.get(neighborCode) ?? 0) > maxSupportingCount) {
        continue;
      }
      const distance = oklabDistance(currentOklab, getCodeOklab(neighborCode)) * 255;
      if (distance <= threshold) {
        return true;
      }
    }
  }
  return false;
}

export function buildLogicalProtectionMask(
  image: RasterImage,
  extraMask: Uint8Array | null | undefined = null,
  contrastThreshold = 20,
) {
  const mask = new Uint8Array(image.width * image.height);
  if (extraMask && extraMask.length === mask.length) {
    mask.set(extraMask);
  }

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = y * image.width + x;
      const pixelOffset = index * 4;
      if (image.data[pixelOffset + 3] < MIN_VISIBLE_PIXEL_ALPHA) {
        continue;
      }
      const currentRgb = readRgb(image, x, y);
      const currentLuma = rgbLuma(currentRgb);

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }
          const neighborX = x + dx;
          const neighborY = y + dy;
          if (
            neighborX < 0 ||
            neighborY < 0 ||
            neighborX >= image.width ||
            neighborY >= image.height
          ) {
            continue;
          }
          const neighborOffset = (neighborY * image.width + neighborX) * 4;
          if (image.data[neighborOffset + 3] < MIN_VISIBLE_PIXEL_ALPHA) {
            continue;
          }
          const neighborRgb = readRgb(image, neighborX, neighborY);
          if (
            Math.abs(currentLuma - rgbLuma(neighborRgb)) >= contrastThreshold ||
            oklabDistance(rgbToOklab(currentRgb), rgbToOklab(neighborRgb)) * 255 >= contrastThreshold * 1.15
          ) {
            mask[index] = 1;
            mask[neighborY * image.width + neighborX] = 1;
          }
        }
      }
    }
  }

  return mask;
}

function sampleHybridPatch(image: RasterImage, left: number, top: number, right: number, bottom: number) {
  const sparse = sampleSparseCell(image, left, top, right, bottom);
  const pixels = collectPatchPixels(image, left, top, right, bottom);
  if (pixels.length === 0) {
    return { rgb: sparse, alpha: 0 };
  }
  const ranked = [...pixels].sort((a, b) => rgbLuma(a) - rgbLuma(b));
  const trim = Math.floor(ranked.length * 0.15);
  const trimmed = ranked.slice(trim, Math.max(trim + 1, ranked.length - trim));
  const trimmedMean = averageRgb(trimmed);
  return {
    rgb: isOccupied(sparse) !== isOccupied(trimmedMean) ? sparse : trimmedMean,
    alpha: 255,
  };
}

function sampleSparseCell(image: RasterImage, left: number, top: number, right: number, bottom: number) {
  const width = Math.max(2, right - left);
  const height = Math.max(2, bottom - top);
  const samples: Rgb[] = [];
  for (const [rx, ry] of [
    [0.22, 0.22],
    [0.78, 0.22],
    [0.22, 0.78],
    [0.78, 0.78],
    [0.5, 0.18],
    [0.5, 0.82],
  ] as const) {
    const x = clamp(Math.round(left + width * rx), left, Math.max(left, right - 1));
    const y = clamp(Math.round(top + height * ry), top, Math.max(top, bottom - 1));
    samples.push(readRgb(image, x, y));
  }
  return averageRgb(samples);
}

function collectPatchPixels(image: RasterImage, left: number, top: number, right: number, bottom: number) {
  const pixels: Rgb[] = [];
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.data[offset + 3] < MIN_VISIBLE_PIXEL_ALPHA) {
        continue;
      }
      pixels.push(readRgb(image, x, y));
    }
  }
  return pixels;
}

function weightedAveragePatch(
  image: RasterImage,
  left: number,
  top: number,
  right: number,
  bottom: number,
) {
  const patchWidth = Math.max(1, right - left);
  const patchHeight = Math.max(1, bottom - top);
  const centerX = left + patchWidth / 2;
  const centerY = top + patchHeight / 2;
  const radiusX = Math.max(0.8, patchWidth * 0.38);
  const radiusY = Math.max(0.8, patchHeight * 0.38);
  let weightedRed = 0;
  let weightedGreen = 0;
  let weightedBlue = 0;
  let visibleWeight = 0;
  let weightedAlpha = 0;
  let alphaWeight = 0;

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * image.width + x) * 4;
      const alpha = image.data[offset + 3];
      const dx = (x + 0.5 - centerX) / radiusX;
      const dy = (y + 0.5 - centerY) / radiusY;
      const spatialWeight = Math.exp(-0.5 * (dx * dx + dy * dy));
      weightedAlpha += alpha * spatialWeight;
      alphaWeight += spatialWeight;
      if (alpha < MIN_VISIBLE_PIXEL_ALPHA) {
        continue;
      }
      const weight = spatialWeight * (alpha / 255);
      weightedRed += image.data[offset] * weight;
      weightedGreen += image.data[offset + 1] * weight;
      weightedBlue += image.data[offset + 2] * weight;
      visibleWeight += weight;
    }
  }

  return {
    rgb:
      visibleWeight > 0
        ? [
            clampToByte(weightedRed / visibleWeight),
            clampToByte(weightedGreen / visibleWeight),
            clampToByte(weightedBlue / visibleWeight),
          ] as Rgb
        : [255, 255, 255] as Rgb,
    alpha: alphaWeight > 0 ? clampToByte(weightedAlpha / alphaWeight) : 0,
  };
}

function buildEdges(size: number, divisions: number) {
  return Array.from({ length: divisions + 1 }, (_, index) =>
    Math.min(size, Math.round((index / divisions) * size)),
  );
}

function readRgb(image: RasterImage, x: number, y: number): Rgb {
  const offset = (y * image.width + x) * 4;
  return [
    image.data[offset] ?? 255,
    image.data[offset + 1] ?? 255,
    image.data[offset + 2] ?? 255,
  ];
}

function averageRgb(samples: Rgb[]): Rgb {
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
    clampToByte(red / samples.length),
    clampToByte(green / samples.length),
    clampToByte(blue / samples.length),
  ];
}

function blendRgb(left: Rgb, right: Rgb, rightWeight: number): Rgb {
  const clampedWeight = Math.max(0, Math.min(1, rightWeight));
  const leftWeight = 1 - clampedWeight;
  return [
    clampToByte(left[0] * leftWeight + right[0] * clampedWeight),
    clampToByte(left[1] * leftWeight + right[1] * clampedWeight),
    clampToByte(left[2] * leftWeight + right[2] * clampedWeight),
  ];
}

function cloneRaster(image: RasterImage): RasterImage {
  return {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampToByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbDistance(left: Rgb, right: Rgb) {
  return Math.sqrt(
    (left[0] - right[0]) * (left[0] - right[0]) +
      (left[1] - right[1]) * (left[1] - right[1]) +
      (left[2] - right[2]) * (left[2] - right[2]),
  );
}

function rgbChannelDelta(left: Rgb, right: Rgb) {
  return Math.max(
    Math.abs(left[0] - right[0]),
    Math.abs(left[1] - right[1]),
    Math.abs(left[2] - right[2]),
  );
}

function rgbLuma(rgb: Rgb) {
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
}

function isOccupied(rgb: Rgb) {
  return rgbLuma(rgb) < 242;
}

function rgbToCode(rgb: Rgb) {
  return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
}

function codeToRgb(code: number): Rgb {
  return [(code >> 16) & 0xff, (code >> 8) & 0xff, code & 0xff];
}

function rgbToOklab([red, green, blue]: Rgb): Oklab {
  const r = srgbToLinear(red / 255);
  const g = srgbToLinear(green / 255);
  const b = srgbToLinear(blue / 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function srgbToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function oklabDistance(left: Oklab, right: Oklab) {
  const deltaL = left[0] - right[0];
  const deltaA = left[1] - right[1];
  const deltaB = left[2] - right[2];
  return Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
}
