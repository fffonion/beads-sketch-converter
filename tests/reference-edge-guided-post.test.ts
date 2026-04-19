import { expect, test } from "bun:test";

import type { EditableCell } from "../src/lib/chart-processor";
import {
  buildStrongArtifactProtectionMask,
  buildMergeArtifactProtectionMask,
  applyGuidedEdgeDarkening,
  expandGuidedSelectionAlongBoundary,
  expandGuidedSelectionByHysteresis,
  pickDominantDarkCell,
  projectSourceEdgeActivation,
  projectSourceEdgeGradientActivation,
  selectSourceGuidedBoundaryIndices,
  type RasterImage,
} from "../src/lib/source-edge-guided-post";

function makeCell(label: string, hex: string): EditableCell {
  return {
    label,
    hex,
    source: "detected",
  };
}

function makeGrayRaster(width: number, height: number, values: number[]): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const value = values[index] ?? 255;
    const offset = index * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return { width, height, data };
}

test("projectSourceEdgeActivation tracks source darkening per logical cell", () => {
  const original = makeGrayRaster(4, 4, new Array(16).fill(220));
  const enhanced = makeGrayRaster(4, 4, [
    120, 120, 220, 220,
    120, 120, 220, 220,
    220, 220, 220, 220,
    220, 220, 220, 220,
  ]);

  const activation = projectSourceEdgeActivation(original, enhanced, 2, 2);

  expect(activation).toHaveLength(4);
  expect(activation[0]).toBeGreaterThan(80);
  expect(activation[1]).toBeLessThan(1);
  expect(activation[2]).toBeLessThan(1);
  expect(activation[3]).toBeLessThan(1);
});

test("projectSourceEdgeGradientActivation stays zero without edge changes", () => {
  const original = makeGrayRaster(4, 4, new Array(16).fill(220));
  const enhanced = makeGrayRaster(4, 4, new Array(16).fill(220));

  const activation = projectSourceEdgeGradientActivation(original, enhanced, 2, 2);

  expect(Array.from(activation)).toEqual([0, 0, 0, 0]);
});

test("projectSourceEdgeGradientActivation reacts to sharpened source boundaries", () => {
  const original = makeGrayRaster(4, 4, new Array(16).fill(220));
  const enhanced = makeGrayRaster(4, 4, [
    120, 120, 220, 220,
    120, 120, 220, 220,
    120, 120, 220, 220,
    120, 120, 220, 220,
  ]);

  const activation = projectSourceEdgeGradientActivation(original, enhanced, 2, 2);

  expect(activation[0]).toBeGreaterThan(0);
  expect(activation[1]).toBeGreaterThan(0);
});

test("applyGuidedEdgeDarkening only accepts darker activated candidates with support", () => {
  const light = makeCell("C29", "#d8efff");
  const dark = makeCell("H16", "#121820");
  const lighter = makeCell("C28", "#ecf8ff");
  const baseCells = [
    light, light, light,
    light, light, light,
    light, light, light,
  ];
  const edgeCells = [
    light, dark, light,
    light, dark, light,
    light, lighter, light,
  ];
  const activation = new Float32Array([
    0, 14, 0,
    0, 18, 0,
    0, 16, 0,
  ]);

  const result = applyGuidedEdgeDarkening(baseCells, edgeCells, activation, 3, 3, {
    activationThreshold: 10,
    minDarken: 12,
    minSupport: 1,
  });

  expect(result.selectedIndices).toEqual([1, 4]);
  expect(result.cells[1]?.label).toBe("H16");
  expect(result.cells[4]?.label).toBe("H16");
  expect(result.cells[7]?.label).toBe("C29");
});

test("applyGuidedEdgeDarkening can be limited to a boundary mask", () => {
  const light = makeCell("C29", "#d8efff");
  const dark = makeCell("H16", "#121820");
  const baseCells = [
    light, light, light,
    light, light, light,
    light, light, light,
  ];
  const edgeCells = [
    light, dark, light,
    light, dark, light,
    light, light, light,
  ];
  const activation = new Float32Array([
    0, 14, 0,
    0, 18, 0,
    0, 0, 0,
  ]);
  const boundaryMask = new Uint8Array([
    0, 0, 0,
    0, 1, 0,
    0, 0, 0,
  ]);

  const result = applyGuidedEdgeDarkening(baseCells, edgeCells, activation, 3, 3, {
    activationThreshold: 10,
    minDarken: 12,
    minSupport: 1,
    boundaryMask,
  });

  expect(result.selectedIndices).toEqual([4]);
  expect(result.cells[1]?.label).toBe("C29");
  expect(result.cells[4]?.label).toBe("H16");
});

test("applyGuidedEdgeDarkening can reject candidates that are not dark enough overall", () => {
  const light = makeCell("C29", "#d8efff");
  const dark = makeCell("H16", "#121820");
  const medium = makeCell("P14", "#7a90b0");
  const baseCells = [
    light, light, light,
    light, light, light,
    light, light, light,
  ];
  const edgeCells = [
    light, dark, light,
    light, medium, light,
    light, light, light,
  ];
  const activation = new Float32Array([
    0, 14, 0,
    0, 18, 0,
    0, 0, 0,
  ]);

  const result = applyGuidedEdgeDarkening(baseCells, edgeCells, activation, 3, 3, {
    activationThreshold: 10,
    minDarken: 12,
    minSupport: 1,
    maxCandidateLuma: 40,
  });

  expect(result.selectedIndices).toEqual([1]);
  expect(result.cells[1]?.label).toBe("H16");
  expect(result.cells[4]?.label).toBe("C29");
});

test("pickDominantDarkCell prefers the most frequent dark candidate", () => {
  const darkA = makeCell("H16", "#121820");
  const darkB = makeCell("H5", "#2a2e38");
  const light = makeCell("C29", "#d8efff");
  const cells = [
    light, darkA, darkA,
    darkB, darkA, light,
  ];

  const picked = pickDominantDarkCell(cells, [1, 2, 3, 4], 60);

  expect(picked?.label).toBe("H16");
});

test("expandGuidedSelectionByHysteresis grows from strong seeds into connected weaker edge cells", () => {
  const light = makeCell("C29", "#d8efff");
  const dark = makeCell("H16", "#121820");
  const baseCells = [
    light, light, light,
    light, light, light,
    light, light, light,
  ];
  const edgeCells = [
    dark, dark, light,
    light, dark, light,
    light, dark, light,
  ];
  const activation = new Float32Array([
    18, 11, 0,
    0, 9, 0,
    0, 8, 0,
  ]);

  const selected = expandGuidedSelectionByHysteresis(baseCells, edgeCells, activation, 3, 3, {
    highThreshold: 16,
    lowThreshold: 8,
    minDarken: 12,
    boundaryMask: new Uint8Array([
      1, 1, 0,
      0, 1, 0,
      0, 1, 0,
    ]),
  });

  expect(selected).toEqual([0, 1, 4, 7]);
});

test("expandGuidedSelectionAlongBoundary fills one-cell silhouette gaps between selected seeds", () => {
  const light = makeCell("C29", "#d8efff");
  const dark = makeCell("H16", "#121820");
  const baseCells = [light, light, light, light, light];
  const edgeCells = [dark, dark, dark, dark, dark];
  const activation = new Float32Array([18, 10, 18, 10, 18]);

  const selected = expandGuidedSelectionAlongBoundary(baseCells, edgeCells, activation, 5, 1, {
    seedIndices: [0, 2, 4],
    lowThreshold: 9,
    minDarken: 12,
    boundaryMask: new Uint8Array([1, 1, 1, 1, 1]),
  });

  expect(selected).toEqual([0, 1, 2, 3, 4]);
});

test("selectSourceGuidedBoundaryIndices should deepen existing boundaries from gradient activation at high strength", () => {
  const background = makeCell("BG", "#ffffff");
  const fill = makeCell("C29", "#d8efff");
  const dark = makeCell("H16", "#121820");
  const baseCells = [
    background, background, background, background, background,
    background, fill, fill, fill, background,
    background, fill, fill, fill, background,
    background, fill, fill, fill, background,
    background, background, background, background, background,
  ];
  const edgeCells = baseCells.map((cell) => ({ ...cell }));
  const boundaryIndices = [6, 7, 8, 11, 13, 16, 17, 18];
  for (const index of boundaryIndices) {
    edgeCells[index] = { ...dark };
  }
  const deltaActivation = new Float32Array(baseCells.length);
  const gradientActivation = new Float32Array(baseCells.length);
  const boundaryMask = new Uint8Array(baseCells.length);
  for (const index of boundaryIndices) {
    gradientActivation[index] = 12;
    boundaryMask[index] = 1;
  }

  const selected = selectSourceGuidedBoundaryIndices(
    baseCells,
    edgeCells,
    deltaActivation,
    gradientActivation,
    5,
    5,
    {
      strength: 100,
      boundaryMask,
    },
  );

  expect(selected).toEqual(boundaryIndices);
});

test("selectSourceGuidedBoundaryIndices should reject candidates that are not visually dark enough", () => {
  const background = makeCell("BG", "#ffffff");
  const fill = makeCell("C29", "#d8efff");
  const medium = makeCell("P14", "#a5b8d0");
  const baseCells = [
    background, background, background, background, background,
    background, fill, fill, fill, background,
    background, fill, fill, fill, background,
    background, fill, fill, fill, background,
    background, background, background, background, background,
  ];
  const edgeCells = baseCells.map((cell) => ({ ...cell }));
  const boundaryIndices = [6, 7, 8, 11, 13, 16, 17, 18];
  for (const index of boundaryIndices) {
    edgeCells[index] = { ...medium };
  }
  const deltaActivation = new Float32Array(baseCells.length);
  const gradientActivation = new Float32Array(baseCells.length);
  const boundaryMask = new Uint8Array(baseCells.length);
  for (const index of boundaryIndices) {
    gradientActivation[index] = 12;
    boundaryMask[index] = 1;
  }

  const selected = selectSourceGuidedBoundaryIndices(
    baseCells,
    edgeCells,
    deltaActivation,
    gradientActivation,
    5,
    5,
    {
      strength: 100,
      boundaryMask,
    },
  );

  expect(selected).toEqual([]);
});

test("selectSourceGuidedBoundaryIndices should leave internal edges alone when only the outer silhouette is allowed", () => {
  const background = makeCell("BG", "#ffffff");
  const fill = makeCell("C29", "#d8efff");
  const dark = makeCell("H16", "#121820");
  const baseCells = [
    background, background, background, background, background,
    background, fill, fill, fill, background,
    background, fill, fill, fill, background,
    background, fill, fill, fill, background,
    background, background, background, background, background,
  ];
  const edgeCells = baseCells.map((cell) => ({ ...cell }));
  const silhouetteIndices = [6, 7, 8, 11, 13, 16, 17, 18];
  for (const index of [...silhouetteIndices, 12]) {
    edgeCells[index] = { ...dark };
  }
  const deltaActivation = new Float32Array(baseCells.length);
  const gradientActivation = new Float32Array(baseCells.length);
  const boundaryMask = new Uint8Array(baseCells.length);
  for (const index of silhouetteIndices) {
    gradientActivation[index] = 12;
    boundaryMask[index] = 1;
  }
  gradientActivation[12] = 18;

  const selected = selectSourceGuidedBoundaryIndices(
    baseCells,
    edgeCells,
    deltaActivation,
    gradientActivation,
    5,
    5,
    {
      strength: 100,
      boundaryMask,
    },
  );

  expect(selected).toEqual(silhouetteIndices);
  expect(selected).not.toContain(12);
});

test("selectSourceGuidedBoundaryIndices should propagate along the outer silhouette from strong seeds", () => {
  const background = makeCell("BG", "#ffffff");
  const fill = makeCell("C29", "#d8efff");
  const dark = makeCell("H16", "#121820");
  const baseCells = [
    background, background, background, background, background,
    background, fill, fill, fill, background,
    background, fill, fill, fill, background,
    background, fill, fill, fill, background,
    background, background, background, background, background,
  ];
  const edgeCells = baseCells.map((cell) => ({ ...cell }));
  const silhouetteIndices = [6, 7, 8, 11, 13, 16, 17, 18];
  for (const index of silhouetteIndices) {
    edgeCells[index] = { ...dark };
  }
  const deltaActivation = new Float32Array(baseCells.length);
  const gradientActivation = new Float32Array(baseCells.length);
  const boundaryMask = new Uint8Array(baseCells.length);
  for (const index of silhouetteIndices) {
    gradientActivation[index] = 0.5;
    boundaryMask[index] = 1;
  }
  for (const index of [7, 11, 13, 17]) {
    gradientActivation[index] = 12;
  }

  const selected = selectSourceGuidedBoundaryIndices(
    baseCells,
    edgeCells,
    deltaActivation,
    gradientActivation,
    5,
    5,
    {
      strength: 100,
      boundaryMask,
    },
  );

  expect(selected).toEqual(silhouetteIndices);
});

test("buildStrongArtifactProtectionMask should make 100 stricter than 85", () => {
  const deltaActivation = new Float32Array([
    0, 0, 0, 0, 0,
    0, 18, 22, 24, 0,
    0, 17, 20, 26, 0,
    0, 0, 14, 0, 0,
    0, 0, 0, 0, 0,
  ]);
  const gradientActivation = new Float32Array([
    0, 0, 0, 0, 0,
    0, 150, 180, 220, 0,
    0, 145, 170, 260, 0,
    0, 0, 130, 0, 0,
    0, 0, 0, 0, 0,
  ]);

  const style75 = buildStrongArtifactProtectionMask(deltaActivation, gradientActivation, 5, 5, 75);
  const style85 = buildStrongArtifactProtectionMask(deltaActivation, gradientActivation, 5, 5, 85);
  const style100 = buildStrongArtifactProtectionMask(deltaActivation, gradientActivation, 5, 5, 100);

  expect(style75).toBeNull();
  expect(style85).not.toBeNull();
  expect(style100).not.toBeNull();
  const style85Count = Array.from(style85 ?? []).reduce((sum, value) => sum + value, 0);
  const style100Count = Array.from(style100 ?? []).reduce((sum, value) => sum + value, 0);
  expect(style100Count).toBeLessThan(style85Count);
  expect(style100Count).toBeGreaterThan(0);
});

test("buildMergeArtifactProtectionMask should stay sparser than the general artifact mask", () => {
  const deltaActivation = new Float32Array([
    0, 0, 0, 0, 0,
    0, 18, 22, 24, 0,
    0, 17, 20, 26, 0,
    0, 0, 14, 0, 0,
    0, 0, 0, 0, 0,
  ]);
  const gradientActivation = new Float32Array([
    0, 0, 0, 0, 0,
    0, 150, 180, 220, 0,
    0, 145, 170, 260, 0,
    0, 0, 130, 0, 0,
    0, 0, 0, 0, 0,
  ]);

  const general = buildStrongArtifactProtectionMask(deltaActivation, gradientActivation, 5, 5, 100);
  const merge = buildMergeArtifactProtectionMask(deltaActivation, gradientActivation, 5, 5, 100);

  expect(general).not.toBeNull();
  expect(merge).not.toBeNull();
  const generalCount = Array.from(general ?? []).reduce((sum, value) => sum + value, 0);
  const mergeCount = Array.from(merge ?? []).reduce((sum, value) => sum + value, 0);
  expect(mergeCount).toBeLessThan(generalCount);
  expect(mergeCount).toBeGreaterThan(0);
});
