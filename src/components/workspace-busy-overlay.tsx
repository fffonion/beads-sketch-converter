import clsx from "clsx";
import { getMobileWorkspaceViewportHeightPx } from "../lib/workspace-layout";

export function WorkspaceBusyIndicator({
  isDark,
}: {
  isDark: boolean;
}) {
  return (
    <div className="flex w-full max-w-[320px] flex-col items-center px-6">
      <div className={clsx("relative h-2 w-full overflow-hidden rounded-full", isDark ? "bg-stone-800/80" : "bg-stone-300/80")}>
        <div
          className={clsx(
            "absolute inset-y-0 w-1/3 rounded-full",
            isDark ? "bg-amber-200/90" : "bg-amber-700/85",
          )}
          style={{ animation: "pindou-indeterminate 1.2s ease-in-out infinite" }}
        />
      </div>
    </div>
  );
}

export function MobileWorkspaceBusyOverlay({
  isDark,
}: {
  isDark: boolean;
}) {
  return (
    <div
      className={clsx(
        "absolute inset-0 z-[80] flex items-center justify-center backdrop-blur-[2px]",
        isDark ? "bg-[#120e0b]/44" : "bg-[#f7f1e4]/62",
      )}
    >
      <WorkspaceBusyIndicator isDark={isDark} />
    </div>
  );
}

export function MobileWorkspaceLoadingFallback({
  isDark,
}: {
  isDark: boolean;
}) {
  const mobileViewportHeightPx =
    typeof window === "undefined"
      ? 0
      : getMobileWorkspaceViewportHeightPx(
          Math.round(window.visualViewport?.height ?? window.innerHeight),
        );

  return (
    <section
      className="relative flex w-full min-w-0 flex-1 flex-col overflow-hidden"
      style={mobileViewportHeightPx > 0 ? { height: `${mobileViewportHeightPx}px` } : undefined}
    >
      <div className="relative min-h-0 w-full min-w-0 flex-1">
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col" />
        <MobileWorkspaceBusyOverlay isDark={isDark} />
      </div>
    </section>
  );
}
