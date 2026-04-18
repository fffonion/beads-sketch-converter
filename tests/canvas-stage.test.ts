import { expect, test } from "bun:test";
import { formatCanvasStatusBadge } from "../src/components/canvas-stage";

test("canvas status badge should show coordinate and size on separate lines", () => {
  expect(formatCanvasStatusBadge(66, 68, null)).toEqual({
    coordinateText: "--, --",
    sizeText: "66 x 68",
  });

  expect(formatCanvasStatusBadge(66, 68, 67)).toEqual({
    coordinateText: "2, 2",
    sizeText: "66 x 68",
  });
});
