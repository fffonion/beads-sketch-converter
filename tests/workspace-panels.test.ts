import { expect, test } from "bun:test";
import {
  getMobileWorkspaceProcessingSyncKey,
  getMobileWorkspaceBusyOverlayLayout,
  getMobileWorkspaceTabAccent,
  getMobileWorkspaceTabLabelStyle,
  shouldUseMobileFocusPindouLayout,
} from "../src/components/workspace-panels";

test("mobile workspace busy overlay should cover only the middle content region", () => {
  expect(getMobileWorkspaceBusyOverlayLayout()).toEqual({
    coverRegion: "content-only",
    excludesTopBanner: true,
    excludesBottomToolbar: true,
  });
});

test("mobile workspace active tab icons should use the brand accent palette", () => {
  expect(getMobileWorkspaceTabAccent("image-process", false)).toBe("#2ea36c");
  expect(getMobileWorkspaceTabAccent("edit", false)).toBe("#d6a41d");
  expect(getMobileWorkspaceTabAccent("pindou", false)).toBe("#df6a41");
  expect(getMobileWorkspaceTabAccent("export", false)).toBe("#4c8fe8");
  expect(getMobileWorkspaceTabAccent("image-process", true)).toBe("#72d7a2");
});

test("mobile workspace active tab labels should keep the normal foreground color instead of brand accent", () => {
  expect(getMobileWorkspaceTabLabelStyle(true, "#2ea36c")).toBeUndefined();
  expect(getMobileWorkspaceTabLabelStyle(false, undefined)).toBeUndefined();
});

test("mobile focus pindou layout should preserve the mobile shell behavior in fullscreen", () => {
  expect(shouldUseMobileFocusPindouLayout("mobile", true)).toBe(true);
  expect(shouldUseMobileFocusPindouLayout("mobile", false)).toBe(false);
  expect(shouldUseMobileFocusPindouLayout("desktop", true)).toBe(false);
});

test("mobile workspace processing sync key should depend on processing state, not the manually selected tab", () => {
  expect(
    getMobileWorkspaceProcessingSyncKey({
      preferredEditorModeSeed: "same-image",
      preferredEditorMode: "pindou",
      editingLocked: false,
    }),
  ).toBe("same-image::pindou::0");
});
