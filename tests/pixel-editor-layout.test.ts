import { expect, test } from "bun:test";
import {
  getDesktopContentFitViewportScale,
  shouldUseDesktopContentFitLayout,
} from "../src/components/pixel-editor-layout";

test("desktop content-fit layout should be disabled on small screens", () => {
  expect(shouldUseDesktopContentFitLayout({ viewportWidth: 0 })).toBe(false);
  expect(shouldUseDesktopContentFitLayout({ viewportWidth: 639 })).toBe(false);
});

test("desktop content-fit layout should be enabled on non-small screens", () => {
  expect(shouldUseDesktopContentFitLayout({ viewportWidth: 640 })).toBe(true);
  expect(shouldUseDesktopContentFitLayout({ viewportWidth: 1280 })).toBe(true);
});

test("desktop content-fit layout should stay disabled in focus mode", () => {
  expect(shouldUseDesktopContentFitLayout({ viewportWidth: 1280, focusOnly: true })).toBe(false);
});

test("desktop content-fit viewport scale should keep more breathing room on larger screens", () => {
  expect(getDesktopContentFitViewportScale(0)).toBe(1);
  expect(getDesktopContentFitViewportScale(639)).toBe(1);
  expect(getDesktopContentFitViewportScale(640)).toBe(0.9);
  expect(getDesktopContentFitViewportScale(959)).toBe(0.9);
  expect(getDesktopContentFitViewportScale(960)).toBe(0.84);
  expect(getDesktopContentFitViewportScale(1279)).toBe(0.84);
  expect(getDesktopContentFitViewportScale(1280)).toBe(0.78);
});
