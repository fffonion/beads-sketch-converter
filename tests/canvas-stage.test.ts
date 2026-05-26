import { expect, test } from "bun:test";
import {
  getCanvasAxisLabelMetrics,
  getCanvasStageGridGap,
  formatCanvasStatusBadge,
  getCanvasStageBitmapRenderScale,
  getCanvasGuideLineMetrics,
  getCanvasStageFitScale,
  getCanvasStageLayoutSize,
  getCanvasStageViewportShellClassName,
  getCanvasStageSurfaceOffset,
  getCanvasStageZoomMetrics,
} from "../src/components/canvas-stage";

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

test("edit canvas gap should default to gapless while pindou keeps the shared grid spacing", () => {
  expect(
    getCanvasStageGridGap({
      stageMode: "edit",
      editGaplessCells: true,
    }),
  ).toBe(0);
  expect(
    getCanvasStageGridGap({
      stageMode: "edit",
      editGaplessCells: false,
    }),
  ).toBe(1);
  expect(
    getCanvasStageGridGap({
      stageMode: "pindou",
      editGaplessCells: true,
    }),
  ).toBe(1);
});

test("canvas zoom metrics should keep render dimensions stable while only display dimensions change", () => {
  const base = getCanvasStageZoomMetrics({
    stageMode: "edit",
    stageScale: 1.2,
    editZoom: 1,
    pindouZoom: 1,
    stageWidth: 240,
    stageHeight: 180,
    cellSize: 12,
    gridGap: 1,
    axisGutter: 0,
  });
  const zoomed = getCanvasStageZoomMetrics({
    stageMode: "edit",
    stageScale: 1.2,
    editZoom: 1.8,
    pindouZoom: 1,
    stageWidth: 240,
    stageHeight: 180,
    cellSize: 12,
    gridGap: 1,
    axisGutter: 0,
  });

  expect(base.renderScale).toBe(1.2);
  expect(zoomed.renderScale).toBe(1.2);
  expect(zoomed.displayScale).toBeCloseTo(2.16);
  expect(zoomed.renderStageWidth).toBe(base.renderStageWidth);
  expect(zoomed.renderStageHeight).toBe(base.renderStageHeight);
  expect(zoomed.displayStageWidth).toBeGreaterThan(base.displayStageWidth);
  expect(zoomed.displayStageHeight).toBeGreaterThan(base.displayStageHeight);
  expect(zoomed.renderCellSize).toBe(base.renderCellSize);
  expect(zoomed.displayCellSize).toBeGreaterThan(base.displayCellSize);
});

test("canvas stage layout size should stay pinned to render dimensions while zoom only expands display bounds", () => {
  const zoomed = getCanvasStageZoomMetrics({
    stageMode: "pindou",
    stageScale: 1.1,
    editZoom: 1,
    pindouZoom: 2.4,
    stageWidth: 280,
    stageHeight: 420,
    cellSize: 10,
    gridGap: 1,
    axisGutter: 24,
  });

  expect(getCanvasStageLayoutSize(zoomed)).toEqual({
    width: zoomed.totalRenderWidth,
    height: zoomed.totalRenderHeight,
  });
  expect(zoomed.totalDisplayWidth).toBeGreaterThan(zoomed.totalRenderWidth);
  expect(zoomed.totalDisplayHeight).toBeGreaterThan(zoomed.totalRenderHeight);
});

test("canvas stage surface offset should center zoomed content inside the stable layout box", () => {
  const zoomed = getCanvasStageZoomMetrics({
    stageMode: "pindou",
    stageScale: 1,
    editZoom: 1,
    pindouZoom: 2,
    stageWidth: 200,
    stageHeight: 300,
    cellSize: 10,
    gridGap: 1,
    axisGutter: 20,
  });

  expect(getCanvasStageSurfaceOffset(zoomed)).toEqual({
    x: -zoomed.totalRenderWidth / 2,
    y: -zoomed.totalRenderHeight / 2,
  });
});

test("pindou fit scale should include axis gutter so 100% still fits the viewport", () => {
  const scale = getCanvasStageFitScale({
    stageMode: "pindou",
    stageWidth: 320,
    stageHeight: 440,
    availableWidth: 300,
    availableHeight: 320,
  });
  const metrics = getCanvasStageZoomMetrics({
    stageMode: "pindou",
    stageScale: scale,
    editZoom: 1,
    pindouZoom: 1,
    stageWidth: 320,
    stageHeight: 440,
    cellSize: 10,
    gridGap: 1,
    axisGutter: Math.max(22, Math.round(26 * scale)),
  });

  expect(metrics.totalRenderWidth).toBeLessThanOrEqual(300);
  expect(metrics.totalRenderHeight).toBeLessThanOrEqual(320);
});

test("fullscreen pindou canvas viewport should not keep rounded corners", () => {
  expect(
    getCanvasStageViewportShellClassName({
      embeddedInPanel: false,
      stageMode: "pindou",
      focusOnly: true,
    }),
  ).toContain("rounded-none");
  expect(
    getCanvasStageViewportShellClassName({
      embeddedInPanel: false,
      stageMode: "pindou",
      focusOnly: true,
    }),
  ).not.toContain("rounded-[10px]");
});

test("embedded canvas viewport shell should use box-border so panel padding does not push it outside the parent height", () => {
  expect(
    getCanvasStageViewportShellClassName({
      embeddedInPanel: true,
      stageMode: "edit",
      focusOnly: false,
    }),
  ).toContain("box-border");
  expect(
    getCanvasStageViewportShellClassName({
      embeddedInPanel: true,
      stageMode: "pindou",
      focusOnly: false,
    }),
  ).toContain("box-border");
});

test("pindou zoom should raise the backing bitmap scale instead of only stretching the canvas with CSS", () => {
  expect(
    getCanvasStageBitmapRenderScale({
      stageMode: "pindou",
      zoomFactor: 2.4,
    }),
  ).toBe(2.4);
  expect(
    getCanvasStageBitmapRenderScale({
      stageMode: "edit",
      zoomFactor: 1.8,
    }),
  ).toBe(1);
});

test("pindou axis labels should keep a stable on-screen size when zoom changes", () => {
  const base = getCanvasAxisLabelMetrics({
    stageScale: 1,
    zoomFactor: 1,
    gutter: 24,
  });
  expect(base.fontSize).toBe(11);
  expect(base.labelOffset).toBeCloseTo(9.12, 6);

  const zoomed = getCanvasAxisLabelMetrics({
    stageScale: 1,
    zoomFactor: 2,
    gutter: 24,
  });
  expect(zoomed.fontSize).toBe(5.5);
  expect(zoomed.labelOffset).toBeCloseTo(4.56, 6);
});

test("pindou guide lines should thin out when the stage is scaled down", () => {
  const compact = getCanvasGuideLineMetrics(4.2);
  const roomy = getCanvasGuideLineMetrics(11.5);

  expect(compact.majorLineWidth).toBeLessThan(roomy.majorLineWidth);
  expect(compact.minorLineWidth).toBeLessThan(roomy.minorLineWidth);
  expect(compact.majorLineWidth).toBeLessThan(1);
  expect(compact.minorDash[0]).toBeLessThan(roomy.minorDash[0]);
});
