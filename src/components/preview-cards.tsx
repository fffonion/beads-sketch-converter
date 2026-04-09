import clsx from "clsx";
import { ChevronDown, Crop, FileImage, ImageUp, LayoutGrid, RotateCcw } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { NormalizedCropRect } from "../lib/mard";
import { getThemeClasses } from "../lib/theme";

type ResizeHandle = "nw" | "ne" | "sw" | "se";
type CropInteraction =
  | {
      mode: "create";
      start: { x: number; y: number };
    }
  | {
      mode: "move";
      start: { x: number; y: number };
      origin: NormalizedCropRect;
    }
  | {
      mode: "resize";
      start: { x: number; y: number };
      origin: NormalizedCropRect;
      handle: ResizeHandle;
    };

export function OriginalPreviewCard({
  title,
  file,
  url,
  busy,
  emptyText,
  sourceChooseImage,
  sourceStayInTab,
  sourceBadge,
  onFileSelection,
  cropReset,
  cropEdit,
  cropMode,
  onCropModeChange,
  cropRect,
  displayCropRect,
  onCropChange,
  isDark,
  collapsed = false,
  onToggleCollapsed,
}: {
  title: string;
  file: File | null;
  url: string | null;
  busy: boolean;
  emptyText: string;
  sourceChooseImage: string;
  sourceStayInTab: string;
  sourceBadge?: { kind: "chart" | "pixel-art"; label: string } | null;
  onFileSelection: (file: File | null) => void;
  cropReset: string;
  cropEdit: string;
  cropMode: boolean;
  onCropModeChange: (enabled: boolean) => void;
  cropRect: NormalizedCropRect | null;
  displayCropRect: NormalizedCropRect | null;
  onCropChange: (cropRect: NormalizedCropRect | null) => void;
  isDark: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const theme = getThemeClasses(isDark);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<CropInteraction | null>(null);
  const [draftCrop, setDraftCrop] = useState<NormalizedCropRect | null>(null);
  const visibleCrop = draftCrop ?? cropRect ?? displayCropRect;

  function handleSelectFile() {
    if (!fileInputRef.current) {
      return;
    }
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!cropMode || !imageRef.current) {
      return;
    }
    if (interactionRef.current) {
      return;
    }
    const normalized = eventToNormalizedPoint(event, imageRef.current);
    if (!normalized) {
      return;
    }

    interactionRef.current = {
      mode: "create",
      start: normalized,
    };
    setDraftCrop({
      x: normalized.x,
      y: normalized.y,
      width: 0,
      height: 0,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!cropMode || !imageRef.current || !interactionRef.current) {
      return;
    }
    const normalized = eventToNormalizedPoint(event, imageRef.current);
    if (!normalized) {
      return;
    }

    const interaction = interactionRef.current;
    if (interaction.mode === "create") {
      setDraftCrop(normalizedRectFromPoints(interaction.start, normalized));
      return;
    }

    if (interaction.mode === "move") {
      setDraftCrop(
        clampCropRect(
          moveCropRect(interaction.origin, normalized.x - interaction.start.x, normalized.y - interaction.start.y),
        ),
      );
      return;
    }

    setDraftCrop(
      clampCropRect(resizeCropRect(interaction.origin, interaction.handle, normalized)),
    );
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!cropMode) {
      return;
    }
    if (!draftCrop || !interactionRef.current) {
      interactionRef.current = null;
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onCropChange(draftCrop.width < 0.02 || draftCrop.height < 0.02 ? null : draftCrop);
    interactionRef.current = null;
    setDraftCrop(null);
  }

  function handleMoveStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (!imageRef.current || !visibleCrop) {
      return;
    }
    const normalized = eventToNormalizedPoint(event, imageRef.current);
    if (!normalized || !previewRef.current) {
      return;
    }

    if (!cropMode) {
      onCropModeChange(true);
    }
    interactionRef.current = {
      mode: "move",
      start: normalized,
      origin: visibleCrop,
    };
    setDraftCrop(visibleCrop);
    previewRef.current.setPointerCapture(event.pointerId);
    event.stopPropagation();
  }

  function handleResizeStart(handle: ResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!imageRef.current || !visibleCrop || !previewRef.current) {
      return;
    }
    const normalized = eventToNormalizedPoint(event, imageRef.current);
    if (!normalized) {
      return;
    }

    if (!cropMode) {
      onCropModeChange(true);
    }
    interactionRef.current = {
      mode: "resize",
      start: normalized,
      origin: visibleCrop,
      handle,
    };
    setDraftCrop(visibleCrop);
    previewRef.current.setPointerCapture(event.pointerId);
    event.stopPropagation();
  }

  return (
    <section className={clsx("rounded-[14px] border p-4 backdrop-blur transition-colors sm:rounded-[16px] sm:p-5 xl:rounded-[18px]", theme.panel)}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <p className={clsx("text-sm font-semibold", theme.cardTitle)}>{title}</p>
            {sourceBadge ? (
              <div
                className={clsx(
                  "flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold shadow-sm",
                  theme.pill,
                )}
              >
                {sourceBadge.kind === "chart" ? (
                  <FileImage aria-hidden="true" className="h-3.5 w-3.5" />
                ) : (
                  <LayoutGrid aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                <span>{sourceBadge.label}</span>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              className={clsx(
                "flex h-9 w-9 items-center justify-center rounded-md text-xs font-semibold transition sm:h-8 sm:w-8",
                theme.pill,
              )}
              aria-label={sourceChooseImage}
              onClick={handleSelectFile}
              title={sourceChooseImage}
              type="button"
            >
              <ImageUp aria-hidden="true" className="h-4 w-4" />
            </button>
            {file ? (
              <>
                <button
                  className={clsx(
                    "flex h-9 w-9 items-center justify-center rounded-md text-xs font-semibold transition sm:h-8 sm:w-8",
                    cropMode ? theme.primaryButton : theme.pill,
                  )}
                  aria-label={cropEdit}
                  onClick={() => onCropModeChange(!cropMode)}
                  title={cropEdit}
                  type="button"
                >
                  <Crop aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  className={clsx(
                    "flex h-9 w-9 items-center justify-center rounded-md text-xs font-semibold transition sm:h-8 sm:w-8",
                    cropRect ? theme.primaryButton : theme.disabledButton,
                  )}
                  aria-label={cropReset}
                  onClick={() => onCropChange(null)}
                  title={cropReset}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" className="h-4 w-4" />
                </button>
              </>
            ) : null}
            {onToggleCollapsed ? (
              <button
                className={clsx(
                  "flex h-9 w-9 items-center justify-center rounded-md text-xs font-semibold transition sm:h-8 sm:w-8",
                  theme.pill,
                )}
                aria-label={collapsed ? title : title}
                onClick={onToggleCollapsed}
                type="button"
              >
                <ChevronDown
                  aria-hidden="true"
                  className={clsx("h-4 w-4 transition-transform", collapsed ? "-rotate-90" : "rotate-0")}
                />
              </button>
            ) : null}
          </div>
        </div>

        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept="image/*"
          onChange={(event) => onFileSelection(event.target.files?.[0] ?? null)}
        />

        {!collapsed && !file ? (
          <label
            className={clsx("flex cursor-pointer flex-col items-center justify-center rounded-[10px] border border-dashed px-4 py-6 text-center transition sm:rounded-[12px] sm:py-7 xl:rounded-[14px] xl:py-8", theme.dropzone)}
            onClick={handleSelectFile}
          >
            <span className={clsx("text-sm font-semibold", theme.cardTitle)}>
              {sourceChooseImage}
            </span>
            {sourceStayInTab ? (
              <span className={clsx("mt-2 text-xs", theme.cardMuted)}>{sourceStayInTab}</span>
            ) : null}
          </label>
        ) : null}
      </div>
      {!collapsed ? (
        <div className={clsx("mt-4 flex min-h-[220px] items-center justify-center overflow-hidden rounded-[10px] sm:min-h-[280px] sm:rounded-[12px]", theme.previewStage)}>
          {url ? (
            <div
              ref={previewRef}
              className="relative inline-block max-h-[52vh] max-w-full touch-none sm:max-h-[66vh] xl:max-h-[72vh]"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <img
                ref={imageRef}
                className="max-h-[52vh] max-w-full object-contain sm:max-h-[66vh] xl:max-h-[72vh]"
                draggable={false}
                src={url}
                alt={title}
              />
              {visibleCrop ? (
                <div
                  className="absolute"
                  style={normalizedCropToStyle(visibleCrop)}
                >
                  <div
                    className={clsx(
                      "absolute inset-0 border-2 border-amber-400 bg-amber-300/18 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]",
                      cropMode || displayCropRect ? "cursor-move pointer-events-auto" : "pointer-events-none",
                    )}
                    onPointerDown={handleMoveStart}
                  />
                  {cropMode || displayCropRect ? (
                    <>
                      {(
                        [
                          ["nw", "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize"],
                          ["ne", "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize"],
                          ["sw", "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize"],
                          ["se", "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize"],
                        ] as const
                      ).map(([handle, position]) => (
                        <button
                          key={handle}
                          className={clsx(
                            "absolute z-10 h-4 w-4 rounded-full border-2 border-white bg-amber-400 shadow",
                            position,
                          )}
                          onPointerDown={(event) => handleResizeStart(handle, event)}
                          type="button"
                        />
                      ))}
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : file && busy ? (
            <div className="flex w-full max-w-[320px] flex-col items-center px-6">
              <div className={clsx("relative h-2 w-full overflow-hidden rounded-full", isDark ? "bg-stone-800/80" : "bg-stone-300/80")}>
                <div
                  className={clsx(
                    "absolute inset-y-0 w-1/3 rounded-full",
                    isDark ? "bg-amber-200/90" : "bg-amber-700/85",
                  )}
                  style={{
                    animation: "pindou-indeterminate 1.2s ease-in-out infinite",
                  }}
                />
              </div>
            </div>
          ) : (
            <p className={clsx("px-8 text-center text-sm", theme.cardMuted)}>{emptyText}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function PreviewCard({
  title,
  subtitle,
  url,
  emptyText,
  isDark,
}: {
  title: string;
  subtitle: string;
  url: string | null;
  emptyText: string;
  isDark: boolean;
}) {
  const theme = getThemeClasses(isDark);
  return (
    <section className={clsx("rounded-[14px] border p-4 backdrop-blur transition-colors sm:rounded-[16px] sm:p-5 xl:rounded-[18px]", theme.panel)}>
      <div>
        <p className={clsx("text-sm font-semibold", theme.cardTitle)}>{title}</p>
        <p className={clsx("text-xs", theme.cardMuted)}>{subtitle}</p>
      </div>
      <div className={clsx("mt-4 flex min-h-[220px] items-center justify-center overflow-hidden rounded-[10px] sm:min-h-[280px] sm:rounded-[12px]", theme.previewStage)}>
        {url ? (
          <img className="max-h-[52vh] max-w-full object-contain sm:max-h-[66vh] xl:max-h-[72vh]" src={url} alt={title} />
        ) : (
          <p className={clsx("px-8 text-center text-sm", theme.cardMuted)}>{emptyText}</p>
        )}
      </div>
    </section>
  );
}

function eventToNormalizedPoint(
  event: ReactPointerEvent<HTMLElement>,
  element: HTMLElement,
) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  return { x, y };
}

function normalizedRectFromPoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
): NormalizedCropRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

function normalizedCropToStyle(cropRect: NormalizedCropRect) {
  return {
    left: `${cropRect.x * 100}%`,
    top: `${cropRect.y * 100}%`,
    width: `${cropRect.width * 100}%`,
    height: `${cropRect.height * 100}%`,
  };
}

function moveCropRect(
  cropRect: NormalizedCropRect,
  deltaX: number,
  deltaY: number,
): NormalizedCropRect {
  return {
    x: cropRect.x + deltaX,
    y: cropRect.y + deltaY,
    width: cropRect.width,
    height: cropRect.height,
  };
}

function resizeCropRect(
  cropRect: NormalizedCropRect,
  handle: ResizeHandle,
  point: { x: number; y: number },
): NormalizedCropRect {
  const left = cropRect.x;
  const top = cropRect.y;
  const right = cropRect.x + cropRect.width;
  const bottom = cropRect.y + cropRect.height;

  switch (handle) {
    case "nw":
      return normalizedRectFromPoints({ x: right, y: bottom }, point);
    case "ne":
      return normalizedRectFromPoints({ x: left, y: bottom }, point);
    case "sw":
      return normalizedRectFromPoints({ x: right, y: top }, point);
    case "se":
      return normalizedRectFromPoints({ x: left, y: top }, point);
  }
}

function clampCropRect(cropRect: NormalizedCropRect): NormalizedCropRect {
  const width = Math.max(0, Math.min(1, cropRect.width));
  const height = Math.max(0, Math.min(1, cropRect.height));
  return {
    x: clampNormalized(cropRect.x, 0, 1 - width),
    y: clampNormalized(cropRect.y, 0, 1 - height),
    width,
    height,
  };
}

function clampNormalized(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
