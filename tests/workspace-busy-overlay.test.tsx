import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MobileWorkspaceBusyOverlay,
  MobileWorkspaceLoadingFallback,
} from "../src/components/workspace-busy-overlay";

test("mobile workspace loading fallback should reuse the same middle-region busy overlay shell", () => {
  const fallbackMarkup = renderToStaticMarkup(
    <MobileWorkspaceLoadingFallback isDark={false} />,
  );
  const overlayMarkup = renderToStaticMarkup(
    <MobileWorkspaceBusyOverlay isDark={false} />,
  );

  expect(fallbackMarkup).toContain("relative flex w-full min-w-0 flex-1 flex-col overflow-hidden");
  expect(fallbackMarkup).toContain("absolute inset-0 z-[80] flex items-center justify-center");
  expect(overlayMarkup).toContain("absolute inset-0 z-[80] flex items-center justify-center");
});
