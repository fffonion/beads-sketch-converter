import { expect, test } from "bun:test";
import { getMobileCardSpacingTokens } from "../src/lib/mobile-card-spacing";

test("mobile card spacing tokens should keep inner content looser than the outer workspace gutter", () => {
  expect(getMobileCardSpacingTokens()).toEqual({
    sectionPadding: "px-5 py-3",
    rowPadding: "px-5 py-3.5",
    contentSpacing: "py-3.5",
    stackedGap: "gap-3.5",
    followUpSpacing: "mt-3.5",
  });
});
