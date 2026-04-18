import * as Slider from "@radix-ui/react-slider";
import clsx from "clsx";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Messages } from "../lib/i18n";
import { colorSystemOptions } from "../lib/chart-processor";
import { getThemeClasses } from "../lib/theme";
import { getNearestPaletteOptions } from "./pixel-editor-color-picker";

export function EditResultSummary({
  t,
  isDark,
  matchedColors,
  disabledResultLabels,
  matchedCoveragePercent,
  activeMatchedColorCount,
  colorSystemId,
  lockColorSystem = false,
  onColorSystemIdChange,
  onMatchedCoveragePercentChange,
  onToggleMatchedColor,
  onReplaceMatchedColor,
  paletteOptions,
}: {
  t: Messages;
  isDark: boolean;
  matchedColors: Array<{ label: string; count: number; hex: string }>;
  disabledResultLabels: string[];
  matchedCoveragePercent: number;
  activeMatchedColorCount: number;
  colorSystemId: string;
  lockColorSystem?: boolean;
  onColorSystemIdChange: (value: string) => void;
  onMatchedCoveragePercentChange: (value: number) => void;
  onToggleMatchedColor: (label: string) => void;
  onReplaceMatchedColor: (sourceLabel: string, targetLabel: string) => void;
  paletteOptions: Array<{ label: string; hex: string }>;
}) {
  const theme = getThemeClasses(isDark);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [triggerRect, setTriggerRect] = useState<{
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null>(null);
  const [hostRect, setHostRect] = useState<{
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const [hoveredAnchorRect, setHoveredAnchorRect] = useState<{
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null>(null);
  const detailsHoldRef = useRef(false);
  const detailsLeaveTimeoutRef = useRef<number | null>(null);
  const popupHoldRef = useRef(false);
  const leaveTimeoutRef = useRef<number | null>(null);
  const disabledLabelSet = useMemo(() => new Set(disabledResultLabels), [disabledResultLabels]);
  const nearestReplacementMap = useMemo(
    () =>
      new Map(
        matchedColors.map((color) => [
          color.label,
          getNearestPaletteOptions(color, paletteOptions, 4),
        ]),
      ),
    [matchedColors, paletteOptions],
  );

  useEffect(() => {
    return () => {
      if (detailsLeaveTimeoutRef.current !== null) {
        window.clearTimeout(detailsLeaveTimeoutRef.current);
      }
      if (leaveTimeoutRef.current !== null) {
        window.clearTimeout(leaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!detailsOpen || typeof window === "undefined") {
      return;
    }

    function syncTriggerRect() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setTriggerRect({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
      const host = triggerRef.current?.closest("[data-edit-toolbar-row='true']") as HTMLElement | null;
      const hostBounds = host?.getBoundingClientRect();
      if (hostBounds) {
        setHostRect({
          left: hostBounds.left,
          top: hostBounds.top,
          right: hostBounds.right,
          bottom: hostBounds.bottom,
          width: hostBounds.width,
          height: hostBounds.height,
        });
      }
    }

    syncTriggerRect();
    window.addEventListener("resize", syncTriggerRect);
    window.addEventListener("scroll", syncTriggerRect, true);
    return () => {
      window.removeEventListener("resize", syncTriggerRect);
      window.removeEventListener("scroll", syncTriggerRect, true);
    };
  }, [detailsOpen]);

  useEffect(() => {
    if (!hoveredLabel || !disabledLabelSet.has(hoveredLabel)) {
      return;
    }
    setHoveredLabel(null);
    setHoveredAnchorRect(null);
  }, [hoveredLabel, disabledLabelSet]);

  function openDetailsPopup() {
    if (detailsLeaveTimeoutRef.current !== null) {
      window.clearTimeout(detailsLeaveTimeoutRef.current);
      detailsLeaveTimeoutRef.current = null;
    }
    detailsHoldRef.current = false;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setTriggerRect({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
    }
    const host = triggerRef.current?.closest("[data-edit-toolbar-row='true']") as HTMLElement | null;
    const hostBounds = host?.getBoundingClientRect();
    if (hostBounds) {
      setHostRect({
        left: hostBounds.left,
        top: hostBounds.top,
        right: hostBounds.right,
        bottom: hostBounds.bottom,
        width: hostBounds.width,
        height: hostBounds.height,
      });
    }
    setDetailsOpen(true);
  }

  function closeDetailsPopupSoon() {
    if (detailsLeaveTimeoutRef.current !== null) {
      window.clearTimeout(detailsLeaveTimeoutRef.current);
    }
    detailsLeaveTimeoutRef.current = window.setTimeout(() => {
      if (detailsHoldRef.current) {
        return;
      }
      popupHoldRef.current = false;
      setHoveredLabel(null);
      setHoveredAnchorRect(null);
      setDetailsOpen(false);
    }, 90);
  }

  function openReplacementPopup(
    label: string,
    event: Pick<MouseEvent, "currentTarget"> & { currentTarget: EventTarget & Element },
  ) {
    if (disabledLabelSet.has(label)) {
      return;
    }
    if (leaveTimeoutRef.current !== null) {
      window.clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    if (detailsLeaveTimeoutRef.current !== null) {
      window.clearTimeout(detailsLeaveTimeoutRef.current);
      detailsLeaveTimeoutRef.current = null;
    }
    detailsHoldRef.current = true;
    popupHoldRef.current = false;
    setHoveredLabel(label);
    const rect = event.currentTarget.getBoundingClientRect();
    setHoveredAnchorRect({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
  }

  function closeReplacementPopupSoon() {
    if (leaveTimeoutRef.current !== null) {
      window.clearTimeout(leaveTimeoutRef.current);
    }
    leaveTimeoutRef.current = window.setTimeout(() => {
      if (popupHoldRef.current) {
        return;
      }
      setHoveredLabel(null);
      setHoveredAnchorRect(null);
    }, 80);
  }

  const hoveredOptions = hoveredLabel ? nearestReplacementMap.get(hoveredLabel) ?? [] : [];
  const detailsPopupWidth =
    hostRect === null
      ? 640
      : Math.min(window.innerWidth - 24, Math.max(420, Math.round(hostRect.width)));
  const detailsShowBelow =
    triggerRect !== null ? triggerRect.bottom + 248 <= window.innerHeight - 12 : true;
  const detailsPopupLeft =
    triggerRect === null
      ? 12
      : Math.min(window.innerWidth - detailsPopupWidth - 12, Math.max(12, triggerRect.left));
  const detailsPopupTop =
    triggerRect === null
      ? 12
      : detailsShowBelow
        ? triggerRect.bottom - 1
        : Math.max(12, triggerRect.top - 248 + 1);
  const detailsBlockWidth = 96;
  const popupWidth = 182;
  const popupHeight = 132;
  const anchorCenterX = hoveredAnchorRect ? hoveredAnchorRect.left + hoveredAnchorRect.width / 2 : null;
  const popupLeft =
    hoveredAnchorRect === null || anchorCenterX === null
      ? 12
      : Math.min(window.innerWidth - popupWidth - 12, Math.max(12, anchorCenterX - popupWidth / 2));
  const showAbove = hoveredAnchorRect !== null ? hoveredAnchorRect.top - popupHeight - 14 >= 12 : true;
  const popupTop =
    hoveredAnchorRect === null
      ? 12
      : showAbove
        ? hoveredAnchorRect.top - popupHeight - 14
        : Math.min(window.innerHeight - popupHeight - 12, Math.max(12, hoveredAnchorRect.bottom + 14));

  const bridge =
    hoveredLabel && hoveredAnchorRect && hoveredOptions.length && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed z-[199]"
            onMouseEnter={() => {
              detailsHoldRef.current = true;
              popupHoldRef.current = true;
              if (leaveTimeoutRef.current !== null) {
                window.clearTimeout(leaveTimeoutRef.current);
                leaveTimeoutRef.current = null;
              }
              if (detailsLeaveTimeoutRef.current !== null) {
                window.clearTimeout(detailsLeaveTimeoutRef.current);
                detailsLeaveTimeoutRef.current = null;
              }
            }}
            onMouseLeave={() => {
              detailsHoldRef.current = false;
              popupHoldRef.current = false;
              closeReplacementPopupSoon();
              closeDetailsPopupSoon();
            }}
            style={{
              left: `${Math.max(12, hoveredAnchorRect.left - 8)}px`,
              top: showAbove ? `${popupTop + popupHeight}px` : `${hoveredAnchorRect.bottom}px`,
              width: `${Math.min(popupWidth, hoveredAnchorRect.width + 16)}px`,
              height: `${Math.max(
                10,
                showAbove
                  ? hoveredAnchorRect.top - (popupTop + popupHeight)
                  : popupTop - hoveredAnchorRect.bottom,
              )}px`,
            }}
          />,
          document.body,
        )
      : null;

  const popup =
    hoveredLabel && hoveredAnchorRect && hoveredOptions.length && typeof document !== "undefined"
      ? createPortal(
          <div
            className={clsx(
              "fixed z-[200] rounded-[10px] border p-3 shadow-xl backdrop-blur",
              theme.controlShell,
            )}
            onMouseEnter={() => {
              detailsHoldRef.current = true;
              popupHoldRef.current = true;
              if (leaveTimeoutRef.current !== null) {
                window.clearTimeout(leaveTimeoutRef.current);
                leaveTimeoutRef.current = null;
              }
              if (detailsLeaveTimeoutRef.current !== null) {
                window.clearTimeout(detailsLeaveTimeoutRef.current);
                detailsLeaveTimeoutRef.current = null;
              }
            }}
            onMouseLeave={() => {
              detailsHoldRef.current = false;
              popupHoldRef.current = false;
              closeReplacementPopupSoon();
              closeDetailsPopupSoon();
            }}
            style={{ left: `${popupLeft}px`, top: `${popupTop}px`, width: `${popupWidth}px` }}
          >
            <div className={clsx("mb-2 text-xs font-semibold", theme.cardMuted)}>
              {t.similarColorsLabel
                ? t.similarColorsLabel(hoveredLabel)
                : t.matchedColorsTitle === "Matched Colors"
                  ? `Colors similar to ${hoveredLabel}`
                  : `和 ${hoveredLabel} 相似的颜色`}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {hoveredOptions.map((option) => (
                <button
                  key={`${hoveredLabel}-${option.label}`}
                  className={clsx(
                    "flex min-w-0 items-center gap-2 rounded-md border px-2 py-2 text-left text-xs transition",
                    theme.card,
                  )}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    onReplaceMatchedColor(hoveredLabel, option.label);
                    setHoveredLabel(null);
                    setHoveredAnchorRect(null);
                    popupHoldRef.current = false;
                  }}
                  onClick={() => {
                    onReplaceMatchedColor(hoveredLabel, option.label);
                    setHoveredLabel(null);
                    setHoveredAnchorRect(null);
                    popupHoldRef.current = false;
                  }}
                  type="button"
                >
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-[4px] border border-black/10"
                    style={{ backgroundColor: option.hex }}
                  />
                  <span className={clsx("min-w-0 truncate font-semibold", theme.cardTitle)}>
                    {option.label}
                  </span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )
      : null;

  const detailsPopup =
    detailsOpen && triggerRect && typeof document !== "undefined"
      ? createPortal(
          <div
            className={clsx(
              "fixed z-[190] overflow-hidden rounded-[10px] border p-3 shadow-xl backdrop-blur",
              theme.controlShell,
              detailsShowBelow ? "rounded-tl-none" : "rounded-bl-none",
              isDark ? "border-white/14" : "border-stone-300",
            )}
            onMouseEnter={() => {
              detailsHoldRef.current = true;
              if (detailsLeaveTimeoutRef.current !== null) {
                window.clearTimeout(detailsLeaveTimeoutRef.current);
                detailsLeaveTimeoutRef.current = null;
              }
            }}
            onMouseLeave={() => {
              detailsHoldRef.current = false;
              closeDetailsPopupSoon();
            }}
            style={{
              left: `${detailsPopupLeft}px`,
              top: `${detailsPopupTop}px`,
              width: `${detailsPopupWidth}px`,
              maxWidth: "calc(100vw - 24px)",
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 sm:w-[220px]">
                <select
                  aria-label={t.colorSystemTitle}
                  className={clsx(
                    "h-10 w-full rounded-md border px-3 text-sm outline-none transition",
                    theme.input,
                  )}
                  disabled={lockColorSystem}
                  value={colorSystemId}
                  onChange={(event) => onColorSystemIdChange(event.target.value)}
                >
                  {colorSystemOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Slider.Root
                  className="relative flex h-5 flex-1 touch-none select-none items-center"
                  max={100}
                  min={0}
                  step={1}
                  value={[matchedCoveragePercent]}
                  onValueChange={(next) => onMatchedCoveragePercentChange(next[0] ?? 100)}
                >
                  <Slider.Track className={clsx("relative h-2 grow rounded-full", theme.sliderTrack)}>
                    <Slider.Range className={clsx("absolute h-full rounded-full", theme.sliderRange)} />
                  </Slider.Track>
                  <Slider.Thumb className={clsx("block h-5 w-5 rounded-full border shadow outline-none", theme.sliderThumb)} />
                </Slider.Root>
                <span className={clsx("shrink-0 text-right text-sm font-semibold", theme.cardTitle)}>
                  {t.labelsCount(activeMatchedColorCount)}
                </span>
              </div>
            </div>
            <div
              className="mt-3 grid max-h-[220px] content-start justify-start gap-2 overflow-auto pr-1"
              style={{ gridTemplateColumns: `repeat(auto-fill, ${detailsBlockWidth}px)` }}
            >
              {matchedColors.map((color) => (
                <button
                  key={color.label}
                  className={clsx(
                    "grid min-h-[50px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                    theme.card,
                  )}
                  onClick={() => onToggleMatchedColor(color.label)}
                  type="button"
                  title={color.label}
                  style={{
                    opacity: disabledLabelSet.has(color.label) ? 0.4 : 1,
                    filter: disabledLabelSet.has(color.label) ? "grayscale(1)" : "none",
                  }}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-black/10"
                    onMouseEnter={
                      disabledLabelSet.has(color.label)
                        ? undefined
                        : (event) => openReplacementPopup(color.label, event)
                    }
                    onMouseLeave={disabledLabelSet.has(color.label) ? undefined : closeReplacementPopupSoon}
                    style={{ backgroundColor: color.hex }}
                  />
                  <span className="min-w-0">
                    <span className={clsx("block truncate text-sm font-semibold", theme.cardTitle)}>
                      {color.label}
                    </span>
                  </span>
                  <span className={clsx("text-xs font-semibold", theme.cardMuted)}>{color.count}</span>
                </button>
              ))}
            </div>
            <p className={clsx("mt-3 text-xs", theme.cardMuted)}>{t.matchedColorsHint}</p>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        className={clsx(
          "flex h-10 shrink-0 items-center gap-2 border px-3 text-sm font-semibold transition sm:px-4",
          detailsOpen ? theme.controlShell : theme.pill,
          isDark ? "border-white/14" : "border-stone-300",
          detailsOpen
            ? detailsShowBelow
              ? "rounded-[8px] rounded-b-none border-b-transparent"
              : "rounded-[8px] rounded-t-none border-t-transparent"
            : "rounded-[8px]",
        )}
        onMouseEnter={openDetailsPopup}
        onMouseLeave={closeDetailsPopupSoon}
        type="button"
      >
        <span className={clsx("text-sm font-semibold", theme.cardTitle)}>
          {t.labelsCount(activeMatchedColorCount)}
        </span>
      </button>
      {bridge}
      {detailsPopup}
      {popup}
    </>
  );
}

