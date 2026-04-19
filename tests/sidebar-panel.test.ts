import { expect, test } from "bun:test";
import {
  getEdgeColorPickerInlineLayout,
  getImageProcessTabLayout,
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
