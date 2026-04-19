import { expect, test } from "bun:test";
import { shouldCloseEdgeColorPickerPopup } from "../src/components/sidebar-panel";

function makeContainsTarget(target: Node) {
  return {
    contains(candidate: Node | null) {
      return candidate === target;
    },
  };
}

test("edge color popup outside-click detection should stay open for clicks inside the popup portal", () => {
  const popupTarget = {} as Node;

  expect(
    shouldCloseEdgeColorPickerPopup(
      popupTarget,
      null,
      makeContainsTarget(popupTarget),
    ),
  ).toBe(false);
});

test("edge color popup outside-click detection should close for clicks outside both anchor and popup", () => {
  const anchorTarget = {} as Node;
  const popupTarget = {} as Node;
  const outsideTarget = {} as Node;

  expect(
    shouldCloseEdgeColorPickerPopup(
      outsideTarget,
      makeContainsTarget(anchorTarget),
      makeContainsTarget(popupTarget),
    ),
  ).toBe(true);
});
