import { expect, test } from "bun:test";
import {
  createCanvasCropRectFromCellIndices,
  cropEditableCells,
  isFullCanvasCropRect,
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
