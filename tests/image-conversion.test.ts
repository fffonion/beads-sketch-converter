import { expect, test } from "bun:test";

import {
  buildImageStyleProfile,
  stylizeLogicalRaster,
  type RasterImage,
} from "../src/lib/image-conversion";

function buildSolidRaster(width: number, height: number, value: number): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return { width, height, data };
}

function setGrayPixel(raster: RasterImage, x: number, y: number, value: number) {
  const offset = (y * raster.width + x) * 4;
  raster.data[offset] = value;
  raster.data[offset + 1] = value;
  raster.data[offset + 2] = value;
  raster.data[offset + 3] = 255;
}

function getGrayPixel(raster: RasterImage, x: number, y: number) {
  const offset = (y * raster.width + x) * 4;
  return raster.data[offset] ?? 0;
}

test("buildImageStyleProfile treats renderStyleBias 50 as the experiment baseline", () => {
  expect(buildImageStyleProfile(0)).toMatchObject({
    samplingBlend: 0,
    ditherStrength: 1,
    cleanupTolerance: 0,
    cleanupPasses: 0,
  });
  expect(buildImageStyleProfile(75)).toMatchObject({
    samplingBlend: 1,
    ditherStrength: 0,
    cleanupTolerance: 24,
    cleanupPasses: 4,
  });
  expect(buildImageStyleProfile(100).samplingBlend).toBe(1);
  expect(buildImageStyleProfile(100).ditherStrength).toBe(0);
  expect(buildImageStyleProfile(100).cleanupTolerance).toBeGreaterThan(24);
  expect(buildImageStyleProfile(100).cleanupPasses).toBeGreaterThan(4);
});

test("stylizeLogicalRaster removes similar-color noise before palette matching while preserving strong contrast detail", () => {
  const raster = buildSolidRaster(5, 5, 200);
  setGrayPixel(raster, 2, 2, 188);
  setGrayPixel(raster, 0, 0, 192);
  setGrayPixel(raster, 4, 2, 84);

  const stylized = stylizeLogicalRaster(raster, {
    cleanupTolerance: 20,
    cleanupPasses: 2,
  });

  expect(getGrayPixel(stylized, 2, 2)).toBe(200);
  expect(getGrayPixel(stylized, 0, 0)).toBe(200);
  expect(getGrayPixel(stylized, 4, 2)).toBe(84);
});

test("stylizeLogicalRaster merges a small near-color patch into its local flat area while preserving dark structure", () => {
  const raster = buildSolidRaster(6, 6, 200);
  setGrayPixel(raster, 2, 2, 190);
  setGrayPixel(raster, 2, 3, 190);
  setGrayPixel(raster, 3, 2, 190);
  setGrayPixel(raster, 3, 3, 190);
  setGrayPixel(raster, 0, 5, 72);
  setGrayPixel(raster, 1, 5, 72);

  const stylized = stylizeLogicalRaster(raster, {
    cleanupTolerance: 18,
    cleanupPasses: 3,
  });

  expect(getGrayPixel(stylized, 2, 2)).toBe(200);
  expect(getGrayPixel(stylized, 2, 3)).toBe(200);
  expect(getGrayPixel(stylized, 3, 2)).toBe(200);
  expect(getGrayPixel(stylized, 3, 3)).toBe(200);
  expect(getGrayPixel(stylized, 0, 5)).toBe(72);
  expect(getGrayPixel(stylized, 1, 5)).toBe(72);
});
