import clsx from "clsx";
import { Crop, ImageUp, RotateCcw } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { NormalizedCropRect } from "../lib/mard";
import { getThemeClasses } from "../lib/theme";

export function OriginalPreviewCard({
  title,
  subtitle,
  privacyNote,
  file,
  url,
  emptyText,
  sourceLocalOnly,
  sourceChooseImage,
  sourceStayInTab,
  onFileSelection,
  cropTitle,
  cropHint,
  cropReset,
  cropEdit,
  cropMode,
  onCropModeChange,
  cropRect,
  onCropChange,
  isDark,
}: {
  title: string;
  subtitle: string;
  privacyNote: string;
  file: File | null;
  url: string | null;
  emptyText: string;
  sourceLocalOnly: string;
  sourceChooseImage: string;
  sourceStayInTab: string;
  onFileSelection: (file: File | null) => void;
  cropTitle: string;
  cropHint: string;
  cropReset: string;
  cropEdit: string;
  cropMode: boolean;
  onCropModeChange: (enabled: boolean) => void;
  cropRect: NormalizedCropRect | null;
  onCropChange: (cropRect: NormalizedCropRect | null) => void;
  isDark: boolean;
}) {
  const theme = getThemeClasses(isDark);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [draftCrop, setDraftCrop] = useState<NormalizedCropRect | null>(null);
  const visibleCrop = draftCrop ?? cropRect;

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
    const normalized = eventToNormalizedPoint(event, imageRef.current);
    if (!normalized) {
      return;
    }

    dragStartRef.current = normalized;
    setDraftCrop({
      x: normalized.x,
      y: normalized.y,
      width: 0,
      height: 0,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!cropMode || !imageRef.current || !dragStartRef.current) {
      return;
    }
    const normalized = eventToNormalizedPoint(event, imageRef.current);
    if (!normalized) {
      return;
    }
    setDraftCrop(normalizedRectFromPoints(dragStartRef.current, normalized));
  }

  function handlePointerUp() {
    if (!cropMode) {
      return;
    }
    if (!draftCrop) {
      dragStartRef.current = null;
      return;
    }

    onCropChange(draftCrop.width < 0.02 || draftCrop.height < 0.02 ? null : draftCrop);
    dragStartRef.current = null;
    setDraftCrop(null);
  }

  return (
    <section className={clsx("rounded-[14px] border p-4 backdrop-blur transition-colors sm:rounded-[16px] sm:p-5 xl:rounded-[18px]", theme.panel)}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={clsx("text-sm font-semibold", theme.cardTitle)}>{title}</p>
            <p className={clsx("text-xs", theme.cardMuted)}>{subtitle}</p>
            <p className={clsx("mt-1 text-xs", theme.cardMuted)}>{privacyNote}</p>
          </div>
          <span className={clsx("shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium sm:px-3 sm:text-xs", theme.tag)}>
            {sourceLocalOnly}
          </span>
        </div>

        {!file ? (
          <label className={clsx("flex cursor-pointer flex-col items-center justify-center rounded-[10px] border border-dashed px-4 py-6 text-center transition sm:rounded-[12px] sm:py-7 xl:rounded-[14px] xl:py-8", theme.dropzone)}>
            <span className={clsx("text-sm font-semibold", theme.cardTitle)}>
              {sourceChooseImage}
            </span>
            <span className={clsx("mt-2 text-xs", theme.cardMuted)}>{sourceStayInTab}</span>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="image/*"
              onChange={(event) => onFileSelection(event.target.files?.[0] ?? null)}
            />
          </label>
        ) : null}

        {file ? (
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept="image/*"
            onChange={(event) => onFileSelection(event.target.files?.[0] ?? null)}
          />
        ) : null}

        {file ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={clsx("text-xs uppercase tracking-[0.18em]", theme.cardMuted)}>{cropTitle}</p>
              <p className={clsx("mt-1 text-xs leading-5", theme.cardMuted)}>{cropHint}</p>
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
            </div>
          </div>
        ) : null}
      </div>
      <div className={clsx("mt-4 flex min-h-[220px] items-center justify-center overflow-hidden rounded-[10px] sm:min-h-[280px] sm:rounded-[12px]", theme.previewStage)}>
        {url ? (
          <div
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
                className="pointer-events-none absolute border-2 border-amber-400 bg-amber-300/18 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
                style={normalizedCropToStyle(visibleCrop)}
              />
            ) : null}
          </div>
        ) : (
          <p className={clsx("px-8 text-center text-sm", theme.cardMuted)}>{emptyText}</p>
        )}
      </div>
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
