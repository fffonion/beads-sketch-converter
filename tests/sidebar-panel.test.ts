import { expect, test } from "bun:test";
import {
  getEdgeColorPickerInlineLayout,
  getImageProcessTabLayout,
  getSidebarPanelMobileLayout,
} from "../src/components/sidebar-panel";

test("edge color picker should render as a full-width inline section with double-size honeycomb cells", () => {
  expect(getEdgeColorPickerInlineLayout()).toEqual({
    renderInlineSection: true,
    sectionWidthMode: "full",
    honeycombScale: 2,
  });
});

test("image process tabs should switch between auto description and manual sizing controls", () => {
  expect(getImageProcessTabLayout("auto")).toEqual({
    showAutoDescription: true,
    showManualSizing: false,
    sections: ["auto-description", "shared-controls"],
    seamlessTopSpacing: true,
  });

  expect(getImageProcessTabLayout("manual")).toEqual({
    showAutoDescription: false,
    showManualSizing: true,
    sections: ["manual-sizing", "shared-controls"],
    seamlessTopSpacing: true,
  });
});

test("mobile landscape sidebar panel should switch to a two-column image process layout", () => {
  expect(
    getSidebarPanelMobileLayout({
      mobileApp: true,
      isLandscapeViewport: true,
    }),
  ).toEqual({
    useTwoColumn: true,
    contentClassName:
      "grid min-h-0 grid-cols-[minmax(248px,0.88fr)_minmax(0,1.12fr)] items-start gap-3",
    previewColumnClassName: "min-h-0",
    controlsColumnClassName: "min-h-0",
  });

  expect(
    getSidebarPanelMobileLayout({
      mobileApp: true,
      isLandscapeViewport: false,
    }),
  ).toEqual({
    useTwoColumn: false,
    contentClassName: "space-y-2.5",
    previewColumnClassName: "",
    controlsColumnClassName: "",
  });
});
