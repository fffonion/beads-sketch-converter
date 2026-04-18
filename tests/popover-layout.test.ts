import { expect, test } from "bun:test";
import { getPopoverViewportLayout } from "../src/components/popover-layout";

test("popover layout should keep its preferred width when the viewport is wide enough", () => {
  expect(
    getPopoverViewportLayout({
      anchorRight: 340,
      preferredWidth: 296,
      viewportWidth: 400,
    }),
  ).toEqual({
    left: 44,
    width: 296,
  });
});

test("popover layout should clamp to the viewport margin when right alignment would overflow left", () => {
  expect(
    getPopoverViewportLayout({
      anchorRight: 180,
      preferredWidth: 296,
      viewportWidth: 320,
    }),
  ).toEqual({
    left: 12,
    width: 296,
  });
});

test("popover layout should shrink when the viewport is narrower than the preferred width", () => {
  expect(
    getPopoverViewportLayout({
      anchorRight: 240,
      preferredWidth: 296,
      viewportWidth: 260,
    }),
  ).toEqual({
    left: 12,
    width: 236,
  });
});
