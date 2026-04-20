import { useEffect, useState } from "react";

export function getIsLandscapeViewport() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.innerWidth > window.innerHeight;
}

export function useLandscapeViewport({
  enabled = true,
  includeOrientationChange = false,
}: {
  enabled?: boolean;
  includeOrientationChange?: boolean;
}) {
  const [isLandscapeViewport, setIsLandscapeViewport] = useState(() => getIsLandscapeViewport());

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    function syncLandscapeViewport() {
      const nextValue = getIsLandscapeViewport();
      setIsLandscapeViewport((current) => (current === nextValue ? current : nextValue));
    }

    syncLandscapeViewport();
    window.addEventListener("resize", syncLandscapeViewport);
    if (includeOrientationChange) {
      window.addEventListener("orientationchange", syncLandscapeViewport);
    }

    return () => {
      window.removeEventListener("resize", syncLandscapeViewport);
      if (includeOrientationChange) {
        window.removeEventListener("orientationchange", syncLandscapeViewport);
      }
    };
  }, [enabled, includeOrientationChange]);

  return isLandscapeViewport;
}
