import clsx from "clsx";
import type { MutableRefObject } from "react";
import type { Messages } from "../lib/i18n";
import type { NormalizedCropRect, ProcessResult } from "../lib/mard";
import type { PindouBeadShape, PindouBoardTheme } from "../lib/pindou-board-theme";
import { getThemeClasses } from "../lib/theme";
import { PixelEditorPanel, type EditorPanelMode } from "./pixel-editor-panel";

export function WorkspacePanels({
  t,
  inputUrl,
  cropRect,
  result,
  busy,
  isDark,
  editTool,
  onEditToolChange,
  editZoom,
  onEditZoomChange,
  editFlipHorizontal,
  onEditFlipHorizontalChange,
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
  onReplaceMatchedColor,
  selectedLabel,
  onSelectedLabelChange,
  colorSystemId,
  onColorSystemIdChange,
  paletteOptions,
  currentCells,
  onApplyCell,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  paintActiveRef,
  focusViewOpen,
  onFocusViewOpenChange,
  focusOnly = false,
  preferredEditorMode = "edit",
  preferredEditorModeSeed = null,
  onPreferredEditorModeChange,
  pindouFlipHorizontal,
  onPindouFlipHorizontalChange,
  pindouShowLabels,
  onPindouShowLabelsChange,
  pindouBeadShape,
  onPindouBeadShapeChange,
  pindouBoardTheme,
  onPindouBoardThemeChange,
  pindouTimerElapsedMs,
  pindouTimerRunning,
  onPindouTimerToggle,
  onPindouTimerReset,
  pindouZoom,
  onPindouZoomChange,
}: {
  t: Messages;
  inputUrl: string | null;
  cropRect: NormalizedCropRect | null;
  result: (ProcessResult & { url: string }) | null;
  busy: boolean;
  isDark: boolean;
  editTool: "paint" | "erase" | "pick" | "fill" | "pan" | "zoom";
  onEditToolChange: (tool: "paint" | "erase" | "pick" | "fill" | "pan" | "zoom") => void;
  editZoom: number;
  onEditZoomChange: (value: number) => void;
  editFlipHorizontal: boolean;
  onEditFlipHorizontalChange: (value: boolean) => void;
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
  onReplaceMatchedColor: (sourceLabel: string, targetLabel: string) => void;
  selectedLabel: string;
  onSelectedLabelChange: (label: string) => void;
  colorSystemId: string;
  onColorSystemIdChange: (value: string) => void;
  paletteOptions: Array<{ label: string; hex: string }>;
  currentCells: ProcessResult["cells"];
  onApplyCell: (
    index: number,
    toolOverride?: "paint" | "erase" | "pick" | "fill" | "pan" | "zoom",
  ) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  paintActiveRef: MutableRefObject<boolean>;
  focusViewOpen: boolean;
  onFocusViewOpenChange: (value: boolean) => void;
  focusOnly?: boolean;
  preferredEditorMode?: EditorPanelMode;
  preferredEditorModeSeed?: string | null;
  onPreferredEditorModeChange?: (mode: EditorPanelMode) => void;
  pindouFlipHorizontal: boolean;
  onPindouFlipHorizontalChange: (value: boolean) => void;
  pindouShowLabels: boolean;
  onPindouShowLabelsChange: (value: boolean) => void;
  pindouBeadShape: PindouBeadShape;
  onPindouBeadShapeChange: (value: PindouBeadShape) => void;
  pindouBoardTheme: PindouBoardTheme;
  onPindouBoardThemeChange: (value: PindouBoardTheme) => void;
  pindouTimerElapsedMs: number;
  pindouTimerRunning: boolean;
  onPindouTimerToggle: () => void;
  onPindouTimerReset: () => void;
  pindouZoom: number;
  onPindouZoomChange: (value: number) => void;
}) {
  const theme = getThemeClasses(isDark);

  if (focusOnly) {
    return (
      <section className="flex min-h-full min-w-0 flex-col overflow-visible">
        {result ? (
          <PixelEditorPanel
            t={t}
            isDark={isDark}
            busy={busy}
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
            editZoom={editZoom}
            onEditZoomChange={onEditZoomChange}
            editFlipHorizontal={editFlipHorizontal}
            onEditFlipHorizontalChange={onEditFlipHorizontalChange}
            selectedLabel={selectedLabel}
            selectedHex={paletteOptions.find((entry) => entry.label === selectedLabel)?.hex ?? null}
            colorSystemId={colorSystemId}
            onColorSystemIdChange={onColorSystemIdChange}
            paletteOptions={paletteOptions}
            onSelectedLabelChange={onSelectedLabelChange}
            onApplyCell={onApplyCell}
            onUndo={onUndo}
            onRedo={onRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            paintActiveRef={paintActiveRef}
            focusViewOpen={focusViewOpen}
            onFocusViewOpenChange={onFocusViewOpenChange}
            focusOnly
            preferredMode={preferredEditorMode}
            preferredModeSeed={preferredEditorModeSeed}
            onPreferredModeChange={onPreferredEditorModeChange}
            resultUrl={result.url}
            resultFileName={result.fileName}
            originalUniqueColors={result.originalUniqueColors}
            reducedUniqueColors={result.reducedUniqueColors}
            disabledResultLabels={disabledResultLabels}
            matchedColors={matchedColorsBase}
            matchedCoveragePercent={matchedCoveragePercent}
            onMatchedCoveragePercentChange={onMatchedCoveragePercentChange}
            onToggleMatchedColor={onToggleMatchedColor}
            onReplaceMatchedColor={onReplaceMatchedColor}
            pindouFlipHorizontal={pindouFlipHorizontal}
            onPindouFlipHorizontalChange={onPindouFlipHorizontalChange}
            pindouShowLabels={pindouShowLabels}
            onPindouShowLabelsChange={onPindouShowLabelsChange}
            pindouBeadShape={pindouBeadShape}
            onPindouBeadShapeChange={onPindouBeadShapeChange}
            pindouBoardTheme={pindouBoardTheme}
            onPindouBoardThemeChange={onPindouBoardThemeChange}
            pindouTimerElapsedMs={pindouTimerElapsedMs}
            pindouTimerRunning={pindouTimerRunning}
            onPindouTimerToggle={onPindouTimerToggle}
            onPindouTimerReset={onPindouTimerReset}
            pindouZoom={pindouZoom}
            onPindouZoomChange={onPindouZoomChange}
          />
        ) : null}
      </section>
    );
  }

  return (
    <section className="flex min-h-[78vh] min-w-0 flex-col overflow-visible sm:min-h-[72vh] xl:min-h-0 xl:overflow-hidden">
      {result ? (
        <PixelEditorPanel
          t={t}
          isDark={isDark}
          busy={busy}
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
          editZoom={editZoom}
          onEditZoomChange={onEditZoomChange}
          editFlipHorizontal={editFlipHorizontal}
          onEditFlipHorizontalChange={onEditFlipHorizontalChange}
          selectedLabel={selectedLabel}
          selectedHex={paletteOptions.find((entry) => entry.label === selectedLabel)?.hex ?? null}
          colorSystemId={colorSystemId}
          onColorSystemIdChange={onColorSystemIdChange}
          paletteOptions={paletteOptions}
          onSelectedLabelChange={onSelectedLabelChange}
          onApplyCell={onApplyCell}
          onUndo={onUndo}
          onRedo={onRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          paintActiveRef={paintActiveRef}
          focusViewOpen={focusViewOpen}
          onFocusViewOpenChange={onFocusViewOpenChange}
          preferredMode={preferredEditorMode}
          preferredModeSeed={preferredEditorModeSeed}
          onPreferredModeChange={onPreferredEditorModeChange}
          resultUrl={result.url}
          resultFileName={result.fileName}
          originalUniqueColors={result.originalUniqueColors}
          reducedUniqueColors={result.reducedUniqueColors}
          disabledResultLabels={disabledResultLabels}
          matchedColors={matchedColorsBase}
          matchedCoveragePercent={matchedCoveragePercent}
          onMatchedCoveragePercentChange={onMatchedCoveragePercentChange}
          onToggleMatchedColor={onToggleMatchedColor}
          onReplaceMatchedColor={onReplaceMatchedColor}
          pindouFlipHorizontal={pindouFlipHorizontal}
          onPindouFlipHorizontalChange={onPindouFlipHorizontalChange}
          pindouShowLabels={pindouShowLabels}
          onPindouShowLabelsChange={onPindouShowLabelsChange}
          pindouBeadShape={pindouBeadShape}
          onPindouBeadShapeChange={onPindouBeadShapeChange}
          pindouBoardTheme={pindouBoardTheme}
          onPindouBoardThemeChange={onPindouBoardThemeChange}
          pindouTimerElapsedMs={pindouTimerElapsedMs}
          pindouTimerRunning={pindouTimerRunning}
          onPindouTimerToggle={onPindouTimerToggle}
          onPindouTimerReset={onPindouTimerReset}
          pindouZoom={pindouZoom}
          onPindouZoomChange={onPindouZoomChange}
        />
      ) : (
        <section
          className={clsx(
            "rounded-[14px] border p-4 backdrop-blur transition-colors sm:rounded-[16px] sm:p-5 xl:rounded-[18px]",
            theme.panel,
          )}
        >
          <div
            className={clsx(
              "flex min-h-[220px] items-center justify-center rounded-[10px] border border-dashed px-5 py-10 text-center text-sm transition-colors",
              theme.emptyState,
            )}
          >
            {busy ? (
              <div className="flex w-full max-w-[320px] flex-col items-center px-4">
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
            ) : (
              t.readyHint
            )}
          </div>
        </section>
      )}
    </section>
  );
}
