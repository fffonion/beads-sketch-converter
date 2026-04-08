import clsx from "clsx";
import * as Slider from "@radix-ui/react-slider";
import type { MutableRefObject } from "react";
import type { Messages } from "../lib/i18n";
import type { NormalizedCropRect, ProcessResult } from "../lib/mard";
import { getThemeClasses } from "../lib/theme";
import { PixelEditorPanel } from "./pixel-editor-panel";
import { StatCard } from "./controls";

export function WorkspacePanels({
  t,
  inputUrl,
  cropRect,
  result,
  isDark,
  editTool,
  onEditToolChange,
  overlayEnabled,
  onOverlayEnabledChange,
  fillTolerance,
  onFillToleranceChange,
  brushSize,
  onBrushSizeChange,
  disabledResultLabels,
  matchedColorsBase,
  matchedCoveragePercent,
  onMatchedCoveragePercentChange,
  onToggleMatchedColor,
  selectedLabel,
  onSelectedLabelChange,
  paletteOptions,
  currentCells,
  onApplyCell,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  paintActiveRef,
}: {
  t: Messages;
  inputUrl: string | null;
  cropRect: NormalizedCropRect | null;
  result: (ProcessResult & { url: string }) | null;
  isDark: boolean;
  editTool: "paint" | "erase" | "pick" | "fill";
  onEditToolChange: (tool: "paint" | "erase" | "pick" | "fill") => void;
  overlayEnabled: boolean;
  onOverlayEnabledChange: (enabled: boolean) => void;
  fillTolerance: number;
  onFillToleranceChange: (value: number) => void;
  brushSize: number;
  onBrushSizeChange: (value: number) => void;
  disabledResultLabels: string[];
  matchedColorsBase: Array<{ label: string; count: number; hex: string }>;
  matchedCoveragePercent: number;
  onMatchedCoveragePercentChange: (value: number) => void;
  onToggleMatchedColor: (label: string) => void;
  selectedLabel: string;
  onSelectedLabelChange: (label: string) => void;
  paletteOptions: Array<{ label: string; hex: string }>;
  currentCells: ProcessResult["cells"];
  onApplyCell: (index: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  paintActiveRef: MutableRefObject<boolean>;
}) {
  const theme = getThemeClasses(isDark);
  const activeMatchedColorCount = matchedColorsBase.filter(
    (color) => !disabledResultLabels.includes(color.label),
  ).length;

  return (
    <section className="flex min-w-0 flex-col gap-6">
      {result ? (
        <PixelEditorPanel
          t={t}
          isDark={isDark}
          cells={currentCells}
          gridWidth={result.gridWidth}
          gridHeight={result.gridHeight}
          inputUrl={inputUrl}
          overlayCropRect={cropRect}
          overlayEnabled={overlayEnabled}
          onOverlayEnabledChange={onOverlayEnabledChange}
          fillTolerance={fillTolerance}
          onFillToleranceChange={onFillToleranceChange}
          brushSize={brushSize}
          onBrushSizeChange={onBrushSizeChange}
          editTool={editTool}
          onEditToolChange={onEditToolChange}
          selectedLabel={selectedLabel}
          selectedHex={paletteOptions.find((entry) => entry.label === selectedLabel)?.hex ?? null}
          paletteOptions={paletteOptions}
          onSelectedLabelChange={onSelectedLabelChange}
          onApplyCell={onApplyCell}
          onUndo={onUndo}
          onRedo={onRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          paintActiveRef={paintActiveRef}
        />
      ) : (
        <section className={clsx("rounded-[14px] border p-4 backdrop-blur transition-colors sm:rounded-[16px] sm:p-5 xl:rounded-[18px]", theme.panel)}>
          <div className={clsx("rounded-[10px] border border-dashed px-5 py-10 text-center text-sm transition-colors", theme.emptyState)}>
            {t.readyHint}
          </div>
        </section>
      )}

      <section className={clsx("rounded-[14px] border p-4 backdrop-blur transition-colors sm:rounded-[16px] sm:p-5 xl:rounded-[18px]", theme.panel)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <p className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.resultTitle}</p>
            <p className={clsx("text-xs", theme.cardMuted)}>{t.resultSubtitle}</p>
          </div>
          <a
            className={clsx("rounded-md px-4 py-2 text-center text-sm font-semibold transition sm:w-auto", result ? theme.primaryButton : theme.disabledButton)}
            href={result?.url ?? undefined}
            download={result?.fileName}
          >
            {t.downloadPng}
          </a>
        </div>

        {result ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <StatCard label={t.gridLabel} value={`${result.gridWidth} x ${result.gridHeight}`} isDark={isDark} />
              <StatCard label={t.logicalColorsLabel} value={`${result.originalUniqueColors} -> ${result.reducedUniqueColors}`} isDark={isDark} />
            </div>

            <div className={clsx("mt-5 rounded-[10px] border p-4 transition-colors sm:rounded-[12px] xl:rounded-[14px]", theme.card)}>
              <div>
                <p className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.matchedColorsTitle}</p>
                <p className={clsx("mt-1 text-xs", theme.cardMuted)}>{t.matchedColorsHint}</p>
              </div>
              <div className="mt-4 flex items-center gap-3">
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
              <div className="mt-4 flex max-h-[360px] flex-wrap gap-2 overflow-auto pr-1">
                {matchedColorsBase.map((color) => (
                  <button
                    key={color.label}
                    className={clsx("flex items-center gap-3 rounded-md border px-3 py-2 transition-colors", theme.pill)}
                    onClick={() => onToggleMatchedColor(color.label)}
                    type="button"
                    title={color.label}
                    style={{
                      opacity: disabledResultLabels.includes(color.label) ? 0.4 : 1,
                      filter: disabledResultLabels.includes(color.label) ? "grayscale(1)" : "none",
                    }}
                  >
                    <span
                      className="h-5 w-5 rounded-full border border-black/10"
                      style={{ backgroundColor: color.hex }}
                    />
                    <span className={clsx("text-sm font-semibold", theme.cardTitle)}>{color.label}</span>
                    <span className={clsx("text-xs", theme.cardMuted)}>{color.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className={clsx("mt-5 rounded-[10px] border border-dashed px-5 py-10 text-center text-sm transition-colors", theme.emptyState)}>
            {t.readyHint}
          </div>
        )}
      </section>
    </section>
  );
}
