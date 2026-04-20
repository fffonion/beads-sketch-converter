import { expect, test } from "bun:test";
import {
  getEditorModeForMobileWorkspacePage,
  getMobileHeaderChromeLayout,
  getMobileHeaderChromeMetrics,
  getMobileLandingLayout,
  getMobileWorkspaceHostLayout,
  getMobileWorkspacePageForEditorMode,
  getMobileWorkspaceViewportHeightPx,
  isMobileLikeEnvironment,
  resolveMobileWorkspacePageAfterProcessing,
  resolveMobileWorkspacePage,
  shouldUseMobileWorkspaceShell,
  type MobileWorkspacePage,
} from "../src/lib/workspace-layout";

test("mobile workspace shell should follow user agent instead of viewport width", () => {
  expect(
    isMobileLikeEnvironment({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      maxTouchPoints: 5,
    }),
  ).toBe(true);
  expect(
    isMobileLikeEnvironment({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36",
      maxTouchPoints: 0,
    }),
  ).toBe(false);
  expect(
    shouldUseMobileWorkspaceShell({
      userAgent:
        "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      maxTouchPoints: 5,
    }),
  ).toBe(true);
  expect(
    shouldUseMobileWorkspaceShell({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
      maxTouchPoints: 5,
    }),
  ).toBe(true);
  expect(
    shouldUseMobileWorkspaceShell({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36",
      maxTouchPoints: 0,
    }),
  ).toBe(false);
});

test("mobile workspace page resolution should redirect locked edit and export tabs to pindou", () => {
  expect(resolveMobileWorkspacePage("image-process", false)).toBe("image-process");
  expect(resolveMobileWorkspacePage("edit", false)).toBe("edit");
  expect(resolveMobileWorkspacePage("pindou", false)).toBe("pindou");
  expect(resolveMobileWorkspacePage("export", false)).toBe("export");

  expect(resolveMobileWorkspacePage("image-process", true)).toBe("image-process");
  expect(resolveMobileWorkspacePage("edit", true)).toBe("pindou");
  expect(resolveMobileWorkspacePage("pindou", true)).toBe("pindou");
  expect(resolveMobileWorkspacePage("export", true)).toBe("pindou");
});

test("mobile workspace pages should map to editor modes only when the top workspace is an editor surface", () => {
  const cases: Array<[MobileWorkspacePage, "edit" | "pindou" | "chart" | null]> = [
    ["image-process", null],
    ["edit", "edit"],
    ["pindou", "pindou"],
    ["export", "chart"],
  ];

  for (const [page, expected] of cases) {
    expect(getEditorModeForMobileWorkspacePage(page)).toBe(expected);
  }
});

test("mobile workspace should auto-open pindou after chart-like processing while leaving normal images on image-process", () => {
  expect(getMobileWorkspacePageForEditorMode("edit")).toBe("edit");
  expect(getMobileWorkspacePageForEditorMode("pindou")).toBe("pindou");
  expect(getMobileWorkspacePageForEditorMode("chart")).toBe("export");

  expect(
    resolveMobileWorkspacePageAfterProcessing({
      currentPage: "image-process",
      preferredEditorMode: "edit",
      editingLocked: false,
    }),
  ).toBe("image-process");

  expect(
    resolveMobileWorkspacePageAfterProcessing({
      currentPage: "image-process",
      preferredEditorMode: "pindou",
      editingLocked: false,
    }),
  ).toBe("pindou");

  expect(
    resolveMobileWorkspacePageAfterProcessing({
      currentPage: "image-process",
      preferredEditorMode: "chart",
      editingLocked: true,
    }),
  ).toBe("pindou");
});

test("mobile header chrome should stay noticeably shorter than the bottom app tab bar", () => {
  expect(getMobileHeaderChromeMetrics()).toEqual({
    minHeightPx: 42,
    topInsetRem: 0.25,
    verticalPaddingRem: 0.35,
    brandWidthPx: 67,
    controlButtonPx: 30,
  });
});

test("mobile header chrome should center the brand while keeping controls overlaid at the trailing edge", () => {
  expect(getMobileHeaderChromeLayout()).toEqual({
    centerBrand: true,
    overlayTrailingControls: true,
    showBrandLogo: false,
    usePlainIconControls: true,
  });
});

test("mobile workspace viewport height should come from the measured viewport instead of CSS dvh math", () => {
  expect(getMobileWorkspaceViewportHeightPx(390)).toBe(310);
  expect(getMobileWorkspaceViewportHeightPx(844)).toBe(764);
  expect(getMobileWorkspaceViewportHeightPx(0)).toBe(0);
});

test("mobile workspace host layout should establish a definite flex height chain for WebKit", () => {
  expect(getMobileWorkspaceHostLayout()).toEqual({
    mainClassName: "flex min-h-screen flex-col overflow-hidden",
    wrapperClassName:
      "mx-auto flex min-h-0 min-w-0 w-full flex-1 max-w-[1760px] flex-col px-2 pb-5 pt-3 lg:px-6 lg:pt-4",
  });
});

test("mobile landscape landing should switch to a compact split layout", () => {
  expect(
    getMobileLandingLayout({
      useMobileWorkspace: true,
      isLandscapeViewport: true,
    }),
  ).toEqual({
    compactLandscape: true,
    wrapperClassName: "mx-auto flex min-h-[calc(100vh-5rem)] max-w-[1760px] items-center justify-center px-3 pb-4 pt-3",
    cardClassName: "w-full max-w-[780px] rounded-[14px] border px-4 py-4 backdrop-blur transition-all",
    contentClassName: "grid grid-cols-[minmax(0,1.05fr)_minmax(260px,0.95fr)] gap-4 items-start",
  });
});
