import type { EditorPanelMode } from "../components/pixel-editor-panel";

export type MobileWorkspacePage = "image-process" | "edit" | "pindou" | "export";

export function isMobileLikeEnvironment({
  userAgent,
  maxTouchPoints = 0,
}: {
  userAgent: string;
  maxTouchPoints?: number;
}) {
  const normalizedUserAgent = userAgent.toLowerCase();
  const matchesMobileUa =
    /android|iphone|ipad|ipod|mobile|tablet|silk|kindle|playbook|opera mini|iemobile/.test(
      normalizedUserAgent,
    );
  const isTouchMac =
    normalizedUserAgent.includes("macintosh") && maxTouchPoints > 1;
  return matchesMobileUa || isTouchMac;
}

export function shouldUseMobileWorkspaceShell({
  userAgent,
  maxTouchPoints = 0,
}: {
  userAgent: string;
  maxTouchPoints?: number;
}) {
  return isMobileLikeEnvironment({ userAgent, maxTouchPoints });
}

export function getMobileHeaderChromeMetrics() {
  return {
    minHeightPx: 42,
    topInsetRem: 0.25,
    verticalPaddingRem: 0.35,
    brandWidthPx: 67,
    controlButtonPx: 30,
  };
}

export function getMobileHeaderChromeLayout() {
  return {
    centerBrand: true,
    overlayTrailingControls: true,
    showBrandLogo: false,
    usePlainIconControls: true,
  };
}

export function getMobileWorkspaceViewportHeightPx(
  viewportHeight: number,
  reservedChromePx = 80,
) {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return 0;
  }

  return Math.max(0, Math.round(viewportHeight - reservedChromePx));
}

export function getMobileLandingLayout({
  useMobileWorkspace,
  isLandscapeViewport,
}: {
  useMobileWorkspace: boolean;
  isLandscapeViewport: boolean;
}) {
  if (useMobileWorkspace && isLandscapeViewport) {
    return {
      compactLandscape: true,
      wrapperClassName: "mx-auto flex min-h-[calc(100vh-5rem)] max-w-[1760px] items-center justify-center px-3 pb-4 pt-3",
      cardClassName: "w-full max-w-[780px] rounded-[14px] border px-4 py-4 backdrop-blur transition-all",
      contentClassName: "grid grid-cols-[minmax(0,1.05fr)_minmax(260px,0.95fr)] gap-4 items-start",
    };
  }

  return {
    compactLandscape: false,
    wrapperClassName: "mx-auto flex min-h-[calc(100vh-8rem)] max-w-[1760px] items-center justify-center px-4 pb-8 pt-6 lg:px-6",
    cardClassName: "w-full max-w-[640px] rounded-[14px] border p-6 text-center backdrop-blur transition-all sm:p-8",
    contentClassName: "block",
  };
}

export function resolveMobileWorkspacePage(
  requestedPage: MobileWorkspacePage,
  editingLocked: boolean,
): MobileWorkspacePage {
  if (!editingLocked) {
    return requestedPage;
  }

  if (requestedPage === "edit" || requestedPage === "export") {
    return "pindou";
  }

  return requestedPage;
}

export function getEditorModeForMobileWorkspacePage(
  page: MobileWorkspacePage,
): EditorPanelMode | null {
  if (page === "image-process") {
    return null;
  }

  if (page === "export") {
    return "chart";
  }

  return page;
}

export function getMobileWorkspacePageForEditorMode(
  mode: EditorPanelMode,
): MobileWorkspacePage {
  if (mode === "chart") {
    return "export";
  }
  if (mode === "pindou") {
    return "pindou";
  }
  return "edit";
}

export function resolveMobileWorkspacePageAfterProcessing({
  currentPage,
  preferredEditorMode,
  editingLocked,
}: {
  currentPage: MobileWorkspacePage;
  preferredEditorMode: EditorPanelMode;
  editingLocked: boolean;
}): MobileWorkspacePage {
  const preferredPage = resolveMobileWorkspacePage(
    getMobileWorkspacePageForEditorMode(preferredEditorMode),
    editingLocked,
  );

  if (currentPage === "image-process" && preferredPage !== "pindou") {
    return currentPage;
  }

  return preferredPage;
}
