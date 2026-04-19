import { expect, test } from "bun:test";
import {
  createCanvasCropRectFromCellIndices,
  cropEditableCells,
  isFullCanvasCropRect,
  resolveMatchedColorsBase,
} from "../src/lib/editor-utils";
import type { EditableCell } from "../src/lib/chart-processor";

function makeCells(gridWidth: number, gridHeight: number) {
  return Array.from({ length: gridWidth * gridHeight }, (_, index) => ({
    label: `C${index}`,
    hex: "#111111",
    source: "detected",
  })) satisfies EditableCell[];
}

test("createCanvasCropRectFromCellIndices normalizes the dragged cell bounds", () => {
  expect(createCanvasCropRectFromCellIndices(14, 1, 5)).toEqual({
    left: 1,
    top: 0,
    width: 4,
    height: 3,
  });
});

test("cropEditableCells returns the cropped canvas cells with updated dimensions", () => {
  const cropped = cropEditableCells(makeCells(4, 3), 4, 3, {
    left: 1,
    top: 1,
    width: 2,
    height: 2,
  });

  expect(cropped.gridWidth).toBe(2);
  expect(cropped.gridHeight).toBe(2);
  expect(cropped.cells.map((cell) => cell.label)).toEqual(["C5", "C6", "C9", "C10"]);
  expect(isFullCanvasCropRect({ left: 0, top: 0, width: 4, height: 3 }, 4, 3)).toBe(true);
});

test("resolveMatchedColorsBase should prefer processed result colors when no local edits are active", () => {
  const processed = [
    { label: "H6", count: 12, hex: "#2F2B2F" },
    { label: "C28", count: 8, hex: "#A9E5E5" },
  ];
  const cells = [
    { label: "H6", hex: "#2F2B2F", source: "detected" },
    { label: "H6", hex: "#2F2B2F", source: "detected" },
    { label: "C28", hex: "#A9E5E5", source: "detected" },
    { label: "M3", hex: "#C5B2BC", source: "detected" },
  ] satisfies EditableCell[];

  const matched = resolveMatchedColorsBase(processed, cells, [
    { label: "H6", hex: "#2F2B2F" },
    { label: "C28", hex: "#A9E5E5" },
    { label: "M3", hex: "#C5B2BC" },
  ], true);

  expect(matched).toEqual(processed);
});
