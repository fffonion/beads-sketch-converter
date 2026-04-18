import * as Tabs from "@radix-ui/react-tabs";
import clsx from "clsx";
import {
  Check,
  Crop,
  Eraser,
  Hand,
  Eye,
  EyeOff,
  FlipHorizontal,
  Maximize2,
  Minimize2,
  Minus,
  Pause,
  PaintBucket,
  Pencil,
  Pipette,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Type as TypeIcon,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { CanvasStage, clampEditorZoom, clampPindouZoom } from "./canvas-stage";
import { ChartSettingsTab } from "./chart-settings-tab";
import { SwitchRow } from "./controls";
import {
  ColorPickerPanel,
  ColorPickerPopup,
  summarizeStageColors,
} from "./pixel-editor-color-picker";
import {
  BatteryStatusIcon,
  BlinkingTimerText,
  formatClockTime,
  formatPindouTimer,
  InlineSliderField,
  PindouBeadShapeButtons,
  PindouBoardThemeButtons,
  ToolIconButton,
} from "./pixel-editor-chrome";
import { EditResultSummary } from "./pixel-editor-result-summary";
import type { Messages } from "../lib/i18n";
import { type EditableCell, type NormalizedCropRect } from "../lib/chart-processor";
import { isFullCanvasCropRect, type CanvasCropRect, type EditTool } from "../lib/editor-utils";
import { type PindouBeadShape, type PindouBoardTheme } from "../lib/pindou-board-theme";
import { getThemeClasses } from "../lib/theme";

export type EditorPanelMode = "edit" | "pindou" | "chart";
const EMPTY_SELECTION_LABEL = "__EMPTY__";

export function PixelEditorPanel({
  t,
  isDark,
  busy,
  cells,
  gridWidth,
  gridHeight,
  inputUrl,
  overlayCropRect,
  overlayEnabled,
  onOverlayEnabledChange,
  fillTolerance,
  onFillToleranceChange,
  brushSize,
  onBrushSizeChange,
  editTool,
  onEditToolChange,
  editZoom,
  onEditZoomChange,
  editFlipHorizontal,
  onEditFlipHorizontalChange,
  selectedLabel,
  selectedHex,
  colorSystemId,
  lockColorSystem = false,
  onColorSystemIdChange,
  paletteOptions,
  onSelectedLabelChange,
  onApplyCell,
  canvasCropSelection,
  onCanvasCropSelectionChange,
  onCanvasCropConfirm,
  onCanvasCropCancel,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  paintActiveRef,
  focusViewOpen,
  onFocusViewOpenChange,
  focusOnly = false,
  preferredMode = "edit",
  preferredModeSeed = null,
  onPreferredModeChange,
  resultReady = true,
  originalUniqueColors,
  reducedUniqueColors,
  disabledResultLabels,
  matchedColors,
  matchedCoveragePercent,
  onMatchedCoveragePercentChange,
  onToggleMatchedColor,
  onReplaceMatchedColor,
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
  chartExportTitle,
  onChartExportTitleChange,
  chartWatermarkText,
  onChartWatermarkTextChange,
  chartWatermarkImageDataUrl,
  chartWatermarkImageName,
  onChartWatermarkImageFile,
  onChartWatermarkImageClear,
  editingLocked = false,
  chartSaveMetadata,
  onChartSaveMetadataChange,
  chartLockEditing,
  onChartLockEditingChange,
  chartIncludeGuides,
  onChartIncludeGuidesChange,
  chartShowColorLabels,
  onChartShowColorLabelsChange,
  chartGaplessCells,
  onChartGaplessCellsChange,
  chartIncludeBoardPattern,
  onChartIncludeBoardPatternChange,
  chartBoardTheme,
  onChartBoardThemeChange,
  chartIncludeLegend,
  onChartIncludeLegendChange,
  chartIncludeQrCode,
  onChartIncludeQrCodeChange,
  chartPreviewUrl,
  chartShareCode,
  chartShareLinkCopied,
  chartShareCodeCopied,
  onCopyChartShareLink,
  onCopyChartShareCode,
  chartPreviewBusy,
  chartShareQrBusy,
  onExportChartShareQr,
  onSaveChart,
  saveBusy,
}: {
  t: Messages;
  isDark: boolean;
  busy: boolean;
  cells: EditableCell[];
  gridWidth: number;
  gridHeight: number;
  inputUrl: string | null;
  overlayCropRect: NormalizedCropRect | null;
  overlayEnabled: boolean;
  onOverlayEnabledChange: (value: boolean) => void;
  fillTolerance: number;
  onFillToleranceChange: (value: number) => void;
  brushSize: number;
  onBrushSizeChange: (value: number) => void;
  editTool: EditTool;
  onEditToolChange: (tool: EditTool) => void;
  editZoom: number;
  onEditZoomChange: (value: number) => void;
  editFlipHorizontal: boolean;
  onEditFlipHorizontalChange: (value: boolean) => void;
  selectedLabel: string;
  selectedHex: string | null;
  colorSystemId: string;
  lockColorSystem?: boolean;
  onColorSystemIdChange: (value: string) => void;
  paletteOptions: Array<{ label: string; hex: string }>;
  onSelectedLabelChange: (label: string) => void;
  onApplyCell: (index: number, toolOverride?: EditTool) => void;
  canvasCropSelection: CanvasCropRect | null;
  onCanvasCropSelectionChange: (cropRect: CanvasCropRect | null) => void;
  onCanvasCropConfirm: () => void | Promise<void>;
  onCanvasCropCancel: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  paintActiveRef: MutableRefObject<boolean>;
  focusViewOpen: boolean;
  onFocusViewOpenChange: (value: boolean) => void;
  focusOnly?: boolean;
  preferredMode?: EditorPanelMode;
  preferredModeSeed?: string | null;
  onPreferredModeChange?: (mode: EditorPanelMode) => void;
  resultReady?: boolean;
  originalUniqueColors: number;
  reducedUniqueColors: number;
  disabledResultLabels: string[];
  matchedColors: Array<{ label: string; count: number; hex: string }>;
  matchedCoveragePercent: number;
  onMatchedCoveragePercentChange: (value: number) => void;
  onToggleMatchedColor: (label: string) => void;
  onReplaceMatchedColor: (sourceLabel: string, targetLabel: string) => void;
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
  chartExportTitle: string;
  onChartExportTitleChange: (value: string) => void;
  chartWatermarkText: string;
  onChartWatermarkTextChange: (value: string) => void;
  chartWatermarkImageDataUrl: string | null;
  chartWatermarkImageName: string;
  onChartWatermarkImageFile: (file: File | null) => void | Promise<void>;
  onChartWatermarkImageClear: () => void;
  editingLocked?: boolean;
  chartSaveMetadata: boolean;
  onChartSaveMetadataChange: (value: boolean) => void;
  chartLockEditing: boolean;
  onChartLockEditingChange: (value: boolean) => void;
  chartIncludeGuides: boolean;
  onChartIncludeGuidesChange: (value: boolean) => void;
  chartShowColorLabels: boolean;
  onChartShowColorLabelsChange: (value: boolean) => void;
  chartGaplessCells: boolean;
  onChartGaplessCellsChange: (value: boolean) => void;
  chartIncludeBoardPattern: boolean;
  onChartIncludeBoardPatternChange: (value: boolean) => void;
  chartBoardTheme: PindouBoardTheme;
  onChartBoardThemeChange: (value: PindouBoardTheme) => void;
  chartIncludeLegend: boolean;
  onChartIncludeLegendChange: (value: boolean) => void;
  chartIncludeQrCode: boolean;
  onChartIncludeQrCodeChange: (value: boolean) => void;
  chartPreviewUrl: string | null;
  chartShareCode: string;
  chartShareLinkCopied: boolean;
  chartShareCodeCopied: boolean;
  onCopyChartShareLink: () => void | Promise<void>;
  onCopyChartShareCode: () => void | Promise<void>;
  chartPreviewBusy: boolean;
  chartShareQrBusy: boolean;
  onExportChartShareQr: () => void | Promise<void>;
  onSaveChart: () => void | Promise<void>;
  saveBusy: boolean;
}) {
  const theme = getThemeClasses(isDark);
  const flipHorizontalLabel = t.pindouFlipHorizontal ?? "Flip Horizontally";
  const panLabel = t.toolPan ?? "骞崇Щ";
  const zoomLabel = t.toolZoom ?? "缂╂斁";
  const forcePindouMode = focusOnly || editingLocked;
  const panelBodyRef = useRef<HTMLElement | null>(null);
  const [panelMode, setPanelMode] = useState<EditorPanelMode>(forcePindouMode ? "pindou" : preferredMode);
  const useAutoHeightChartLayout = panelMode === "chart";
  const [focusedSketchLabel, setFocusedSketchLabel] = useState<string | null>(null);
  const [panelViewportHeight, setPanelViewportHeight] = useState(0);
  const activeMatchedColorCount = matchedColors.filter(
    (color) => !disabledResultLabels.includes(color.label),
  ).length;
  const pindouColors = useMemo(
    () => summarizeStageColors(cells, paletteOptions),
    [cells, paletteOptions],
  );
  const topTabClassName = (active: boolean, disabled = false) =>
    clsx(
      "inline-flex h-10 shrink-0 items-center justify-center rounded-t-[10px] px-4 text-sm font-semibold leading-none outline-none transition",
      disabled && "cursor-not-allowed opacity-55",
      active
        ? clsx(
            "relative z-10 -mb-px border border-b-transparent shadow-sm",
            isDark ? theme.controlSegment : theme.panel,
            theme.cardTitle,
            isDark ? "border-white/14" : "border-stone-300",
          )
        : clsx(
            isDark ? theme.panel : theme.controlSegment,
            theme.cardMuted,
            disabled ? "opacity-100" : "opacity-100 hover:brightness-95",
          ),
    );

  const tools: Array<{
    id: EditTool;
    label: string;
    icon: typeof Pencil;
  }> = [
    { id: "pan", label: panLabel, icon: Hand },
    { id: "zoom", label: zoomLabel, icon: Search },
    { id: "crop", label: t.toolCrop, icon: Crop },
    { id: "paint", label: t.toolPaint, icon: Pencil },
    { id: "erase", label: t.toolErase, icon: Eraser },
    { id: "pick", label: t.toolPick, icon: Pipette },
    { id: "fill", label: t.toolFill, icon: PaintBucket },
  ];

  useEffect(() => {
    if (!focusedSketchLabel) {
      return;
    }

    if (!cells.some((cell) => cell.label === focusedSketchLabel)) {
      setFocusedSketchLabel(null);
    }
  }, [cells, focusedSketchLabel]);

  useEffect(() => {
    if (forcePindouMode && panelMode !== "pindou") {
      setPanelMode("pindou");
    }
  }, [forcePindouMode, panelMode]);

  useEffect(() => {
    if (!forcePindouMode) {
      setPanelMode(preferredMode);
    }
  }, [forcePindouMode, preferredMode, preferredModeSeed]);

  useEffect(() => {
    if (focusOnly) {
      return;
    }

    function syncPanelViewportHeight() {
      if (!panelBodyRef.current) {
        return;
      }

      const viewportWidth = window.innerWidth;
      const nextHeight =
        viewportWidth < 640
          ? Math.max(680, Math.round(window.innerHeight * 0.9))
          : viewportWidth < 1280
            ? Math.max(620, Math.round(window.innerHeight * 0.82))
          : Math.max(420, Math.round(window.innerHeight - panelBodyRef.current.getBoundingClientRect().top - 24));
      setPanelViewportHeight((previous) => (previous === nextHeight ? previous : nextHeight));
    }

    syncPanelViewportHeight();
    const observer = new ResizeObserver(() => syncPanelViewportHeight());
    if (panelBodyRef.current) {
      observer.observe(panelBodyRef.current);
    }
    window.addEventListener("resize", syncPanelViewportHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncPanelViewportHeight);
    };
  }, [focusOnly, panelMode]);

  return (
    focusOnly ? (
      <PindouModePanel
        t={t}
        isDark={isDark}
        busy={busy}
        cells={cells}
        gridWidth={gridWidth}
        gridHeight={gridHeight}
        panelViewportHeight={panelViewportHeight}
        focusedSketchLabel={focusedSketchLabel}
        onFocusedSketchLabelChange={setFocusedSketchLabel}
        pindouColors={pindouColors}
        paintActiveRef={paintActiveRef}
        focusViewOpen={focusViewOpen}
            onFocusViewOpenChange={onFocusViewOpenChange}
            focusOnly
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
    <Tabs.Root
      className={clsx("flex min-w-0 flex-col", useAutoHeightChartLayout ? "w-full" : "min-h-0 flex-1")}
      value={panelMode}
      onValueChange={(value) => {
        const nextMode = value as EditorPanelMode;
        setPanelMode(nextMode);
        onPreferredModeChange?.(nextMode);
      }}
    >
      <div className="relative z-10 mb-[-1px] flex min-w-0 items-end gap-3">
        <Tabs.List className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto overflow-y-hidden">
          {([
            ["edit", editingLocked ? t.editorTabEditLocked : t.editorTabEdit, editingLocked],
            ["pindou", t.editorTabPindou, false],
          ] as const).map(([value, label, disabled]) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className={topTabClassName(panelMode === value, disabled)}
              disabled={disabled}
            >
              {label}
            </Tabs.Trigger>
          ))}
          <Tabs.Trigger
            className={topTabClassName(panelMode === "chart", editingLocked)}
            disabled={editingLocked}
            value="chart"
          >
            {editingLocked ? t.editorTabChartLocked : t.editorTabChartSettings}
          </Tabs.Trigger>
        </Tabs.List>
      </div>

      <section
        ref={panelBodyRef}
        className={clsx(
          "flex min-w-0 flex-col rounded-[14px] rounded-tl-none rounded-tr-none border backdrop-blur transition-colors sm:rounded-[16px] sm:rounded-tl-none sm:rounded-tr-none xl:rounded-[18px] xl:rounded-tl-none xl:rounded-tr-none",
          useAutoHeightChartLayout ? "overflow-visible" : "min-h-0 flex-1 overflow-hidden",
          theme.panel,
        )}
        style={
          !useAutoHeightChartLayout && panelViewportHeight > 0
            ? { height: `${panelViewportHeight}px`, minHeight: `${panelViewportHeight}px` }
            : undefined
        }
      >
        <Tabs.Content value="edit" className="flex min-h-0 flex-1">
          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div
              data-edit-toolbar-row="true"
              className={clsx(
                "relative z-20 flex min-w-0 shrink-0 flex-wrap items-start gap-2 px-2 py-2 sm:flex-nowrap sm:px-2 sm:py-2 lg:px-1.5",
                theme.subtlePanel,
              )}
            >
              <EditResultSummary
                t={t}
                isDark={isDark}
                matchedColors={matchedColors}
                disabledResultLabels={disabledResultLabels}
                matchedCoveragePercent={matchedCoveragePercent}
                activeMatchedColorCount={activeMatchedColorCount}
                colorSystemId={colorSystemId}
                lockColorSystem={lockColorSystem}
                onColorSystemIdChange={onColorSystemIdChange}
                onMatchedCoveragePercentChange={onMatchedCoveragePercentChange}
                onToggleMatchedColor={onToggleMatchedColor}
                onReplaceMatchedColor={onReplaceMatchedColor}
                paletteOptions={paletteOptions}
              />
              <button
                className={clsx(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border transition",
                  editFlipHorizontal ? theme.controlButtonActive : theme.pill,
                  isDark ? "border-white/14" : "border-stone-300",
                )}
                onClick={() => onEditFlipHorizontalChange(!editFlipHorizontal)}
                title={t.pindouFlipHorizontal ?? "Flip Horizontally"}
                type="button"
              >
                <FlipHorizontal className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <ContextToolStrip
                  t={t}
                  isDark={isDark}
                  editTool={editTool}
                  editFlipHorizontal={editFlipHorizontal}
                  selectedLabel={selectedLabel}
                  selectedHex={selectedHex}
                  paletteOptions={paletteOptions}
                  brushSize={brushSize}
                  onBrushSizeChange={onBrushSizeChange}
                  editZoom={editZoom}
                  onEditZoomChange={onEditZoomChange}
                  onEditFlipHorizontalChange={onEditFlipHorizontalChange}
                  fillTolerance={fillTolerance}
                  onFillToleranceChange={onFillToleranceChange}
                  onEditToolChange={onEditToolChange}
                  onSelectedLabelChange={onSelectedLabelChange}
                  canvasCropSelection={canvasCropSelection}
                  gridWidth={gridWidth}
                  gridHeight={gridHeight}
                  onCanvasCropConfirm={onCanvasCropConfirm}
                  onCanvasCropCancel={onCanvasCropCancel}
                  showFlipButton={false}
                />
              </div>
            </div>

            <div className={clsx("relative z-20 h-px w-full shrink-0", theme.divider)} />

            <div className="relative z-0 flex min-h-0 min-w-0 flex-1 overflow-hidden flex-col lg:grid lg:grid-cols-[60px_minmax(0,1fr)]">
              <section
                className={clsx(
                  "min-h-0 min-w-0 border-b p-2 transition-colors lg:border-b-0 lg:border-r lg:p-1.5",
                  isDark ? "border-white/10" : "border-stone-200",
                )}
              >
                <div className="flex w-full flex-wrap gap-2 overflow-visible lg:flex-col lg:flex-nowrap">
                  {tools.map((tool) => (
                    <ToolIconButton
                      key={tool.id}
                      active={editTool === tool.id}
                      icon={tool.icon}
                      isDark={isDark}
                      label={tool.label}
                      onClick={() => onEditToolChange(tool.id)}
                    />
                  ))}
                  <div className={clsx("hidden h-px lg:block", theme.divider)} />
                  <div className="flex flex-wrap gap-2 lg:contents">
                    <ToolIconButton
                      active={false}
                      disabled={!canUndo}
                      icon={Undo2}
                      isDark={isDark}
                      label={t.toolUndo}
                      onClick={onUndo}
                    />
                    <ToolIconButton
                      active={false}
                      disabled={!canRedo}
                      icon={Redo2}
                      isDark={isDark}
                      label={t.toolRedo}
                      onClick={onRedo}
                    />
                    <div className={clsx("hidden h-px lg:block", theme.divider)} />
                    <ToolIconButton
                      active={overlayEnabled}
                      icon={overlayEnabled ? Eye : EyeOff}
                      isDark={isDark}
                      label={t.overlayToggle}
                      onClick={() => onOverlayEnabledChange(!overlayEnabled)}
                    />
                  </div>
                </div>
              </section>

              <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
                <CanvasStage
                  cells={cells}
                  gridWidth={gridWidth}
                  gridHeight={gridHeight}
                  emptyPixelLabel={t.emptyPixel}
                  inputUrl={inputUrl}
                  overlayCropRect={overlayCropRect}
                  overlayEnabled={overlayEnabled}
                  isDark={isDark}
                  stageMode="edit"
                  editTool={editTool}
                  brushSize={brushSize}
                  editZoom={editZoom}
                  onEditZoomChange={onEditZoomChange}
                  flipHorizontal={editFlipHorizontal}
                  selectedHex={selectedHex}
                  onApplyCell={onApplyCell}
                  canvasCropSelection={canvasCropSelection}
                  onCanvasCropSelectionChange={onCanvasCropSelectionChange}
                  paintActiveRef={paintActiveRef}
                  busy={busy}
                  embeddedInPanel
                />
              </div>
            </div>
          </section>
        </Tabs.Content>

        <Tabs.Content value="pindou" className="flex min-h-0 w-full flex-1">
          <PindouModePanel
            t={t}
            isDark={isDark}
            busy={busy}
            cells={cells}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            panelViewportHeight={panelViewportHeight}
            focusedSketchLabel={focusedSketchLabel}
            onFocusedSketchLabelChange={setFocusedSketchLabel}
            pindouColors={pindouColors}
            paintActiveRef={paintActiveRef}
            focusViewOpen={focusViewOpen}
            onFocusViewOpenChange={onFocusViewOpenChange}
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
        </Tabs.Content>

        <Tabs.Content
          value="chart"
          className={clsx(useAutoHeightChartLayout ? "block" : "flex min-h-0 flex-1 overflow-hidden")}
        >
          <ChartSettingsTab
            t={t}
            isDark={isDark}
            chartExportTitle={chartExportTitle}
            onChartExportTitleChange={onChartExportTitleChange}
            chartWatermarkText={chartWatermarkText}
            onChartWatermarkTextChange={onChartWatermarkTextChange}
            chartWatermarkImageDataUrl={chartWatermarkImageDataUrl}
            chartWatermarkImageName={chartWatermarkImageName}
            onChartWatermarkImageFile={onChartWatermarkImageFile}
            onChartWatermarkImageClear={onChartWatermarkImageClear}
            chartSaveMetadata={chartSaveMetadata}
            onChartSaveMetadataChange={onChartSaveMetadataChange}
            chartLockEditing={chartLockEditing}
            onChartLockEditingChange={onChartLockEditingChange}
            chartIncludeGuides={chartIncludeGuides}
            onChartIncludeGuidesChange={onChartIncludeGuidesChange}
            chartShowColorLabels={chartShowColorLabels}
            onChartShowColorLabelsChange={onChartShowColorLabelsChange}
            chartGaplessCells={chartGaplessCells}
            onChartGaplessCellsChange={onChartGaplessCellsChange}
            chartIncludeBoardPattern={chartIncludeBoardPattern}
            onChartIncludeBoardPatternChange={onChartIncludeBoardPatternChange}
            chartBoardTheme={chartBoardTheme}
            onChartBoardThemeChange={onChartBoardThemeChange}
            chartIncludeLegend={chartIncludeLegend}
            onChartIncludeLegendChange={onChartIncludeLegendChange}
            chartIncludeQrCode={chartIncludeQrCode}
            onChartIncludeQrCodeChange={onChartIncludeQrCodeChange}
            chartPreviewUrl={chartPreviewUrl}
            chartShareCode={chartShareCode}
            chartShareLinkCopied={chartShareLinkCopied}
            chartShareCodeCopied={chartShareCodeCopied}
            onCopyChartShareLink={onCopyChartShareLink}
            onCopyChartShareCode={onCopyChartShareCode}
            chartPreviewBusy={chartPreviewBusy}
            chartShareQrBusy={chartShareQrBusy}
            onExportChartShareQr={onExportChartShareQr}
            onSaveChart={onSaveChart}
            saveBusy={saveBusy || busy || !resultReady}
          />
        </Tabs.Content>
      </section>
    </Tabs.Root>
    )
  );
}

function PindouModePanel({
  t,
  isDark,
  busy,
  cells,
  gridWidth,
  gridHeight,
  panelViewportHeight = 0,
  focusedSketchLabel,
  onFocusedSketchLabelChange,
  pindouColors,
  paintActiveRef,
  focusViewOpen,
  onFocusViewOpenChange,
  focusOnly = false,
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
  isDark: boolean;
  busy: boolean;
  cells: EditableCell[];
  gridWidth: number;
  gridHeight: number;
  panelViewportHeight?: number;
  focusedSketchLabel: string | null;
  onFocusedSketchLabelChange: (label: string | null) => void;
  pindouColors: Array<{ label: string; count: number; hex: string }>;
  paintActiveRef: MutableRefObject<boolean>;
  focusViewOpen: boolean;
  onFocusViewOpenChange: (value: boolean) => void;
  focusOnly?: boolean;
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
  const flipHorizontalLabel = t.pindouFlipHorizontal ?? "Flip Horizontally";
  const beadShapeLabel = t.pindouBeadShapeLabel ?? "豆子形状";
  const showLabelsLabel = t.pindouShowLabels ?? "显示颜色名称";
  const boardThemeLabel = t.pindouBoardThemeLabel ?? "底纹";
  const timerStartLabel = t.pindouTimerStart ?? "开始计时";
  const timerPauseLabel = t.pindouTimerPause ?? "暂停计时";
  const timerResetLabel = t.pindouTimerReset ?? "重置计时";
  const timerDisplay = formatPindouTimer(pindouTimerElapsedMs);
  const boardThemeLabels: Record<PindouBoardTheme, string> = {
    none: t.pindouBoardThemeNone ?? "无底纹",
    gray: t.pindouBoardThemeGray ?? "灰色系",
    green: t.pindouBoardThemeGreen ?? "绿色系",
    pink: t.pindouBoardThemePink ?? "粉色系",
    blue: t.pindouBoardThemeBlue ?? "蓝色系",
  };
  const beadShapeLabels: Record<PindouBeadShape, string> = {
    square: t.pindouBeadShapeSquare ?? "方块",
    circle: t.pindouBeadShapeCircle ?? "圆圈",
  };
  const [isLandscapeViewport, setIsLandscapeViewport] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth > window.innerHeight;
  });
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === "undefined" ? 0 : window.innerWidth));
  const [focusToolbarMenuOpen, setFocusToolbarMenuOpen] = useState(false);
  const [currentClock, setCurrentClock] = useState(() => formatClockTime());
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [timerColonVisible, setTimerColonVisible] = useState(() => new Date().getSeconds() % 2 === 0);
  const [portraitFocusZoomBarVisible, setPortraitFocusZoomBarVisible] = useState(true);
  const showPinnedTimerSummary = pindouTimerRunning || pindouTimerElapsedMs > 0;
  const isMobileUserAgent = useMemo(() => {
    if (typeof navigator === "undefined") {
      return false;
    }

    return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent ?? "");
  }, []);
  const useCompactLandscapeFocusToolbar = focusOnly && isLandscapeViewport && viewportWidth <= 1180;
  const usePortraitMobileFocusZoomBar = focusOnly && isMobileUserAgent && !isLandscapeViewport;
  const portraitFocusZoomHideTimerRef = useRef<number | null>(null);
  const lastPortraitFocusZoomRef = useRef(pindouZoom);

  useEffect(() => {
    if (!focusOnly) {
      return;
    }

    function syncLandscapeViewport() {
      setViewportWidth(window.innerWidth);
      setIsLandscapeViewport(window.innerWidth > window.innerHeight);
    }

    syncLandscapeViewport();
    window.addEventListener("resize", syncLandscapeViewport);
    return () => {
      window.removeEventListener("resize", syncLandscapeViewport);
    };
  }, [focusOnly]);

  useEffect(() => {
    if (!pindouTimerRunning) {
      setTimerColonVisible(true);
      return;
    }

    setTimerColonVisible(new Date().getSeconds() % 2 === 0);
    const timerId = window.setInterval(() => {
      setTimerColonVisible(new Date().getSeconds() % 2 === 0);
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [pindouTimerRunning]);

  useEffect(() => {
    if (!useCompactLandscapeFocusToolbar) {
      setFocusToolbarMenuOpen(false);
    }
  }, [useCompactLandscapeFocusToolbar]);

  useEffect(() => {
    if (!usePortraitMobileFocusZoomBar) {
      setPortraitFocusZoomBarVisible(true);
      if (portraitFocusZoomHideTimerRef.current !== null) {
        window.clearTimeout(portraitFocusZoomHideTimerRef.current);
        portraitFocusZoomHideTimerRef.current = null;
      }
      lastPortraitFocusZoomRef.current = pindouZoom;
      return;
    }

    const restartHideTimer = () => {
      setPortraitFocusZoomBarVisible(true);
      if (portraitFocusZoomHideTimerRef.current !== null) {
        window.clearTimeout(portraitFocusZoomHideTimerRef.current);
      }
      portraitFocusZoomHideTimerRef.current = window.setTimeout(() => {
        setPortraitFocusZoomBarVisible(false);
        portraitFocusZoomHideTimerRef.current = null;
      }, 3000);
    };

    restartHideTimer();
    return () => {
      if (portraitFocusZoomHideTimerRef.current !== null) {
        window.clearTimeout(portraitFocusZoomHideTimerRef.current);
        portraitFocusZoomHideTimerRef.current = null;
      }
    };
  }, [usePortraitMobileFocusZoomBar]);

  useEffect(() => {
    if (!usePortraitMobileFocusZoomBar) {
      lastPortraitFocusZoomRef.current = pindouZoom;
      return;
    }
    if (lastPortraitFocusZoomRef.current === pindouZoom) {
      return;
    }
    lastPortraitFocusZoomRef.current = pindouZoom;
    setPortraitFocusZoomBarVisible(true);
    if (portraitFocusZoomHideTimerRef.current !== null) {
      window.clearTimeout(portraitFocusZoomHideTimerRef.current);
    }
    portraitFocusZoomHideTimerRef.current = window.setTimeout(() => {
      setPortraitFocusZoomBarVisible(false);
      portraitFocusZoomHideTimerRef.current = null;
    }, 3000);
  }, [pindouZoom, usePortraitMobileFocusZoomBar]);

  useEffect(() => {
    if (!focusOnly) {
      return;
    }

    setCurrentClock(formatClockTime());
    const timerId = window.setInterval(() => {
      setCurrentClock(formatClockTime());
    }, 30_000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [focusOnly]);

  useEffect(() => {
    if (!focusOnly || !isMobileUserAgent) {
      setBatteryPercent(null);
      return;
    }

    const batteryGetter = (navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number;
        addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
        removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
      }>;
    }).getBattery;

    if (!batteryGetter) {
      console.info("[pindou] navigator.getBattery is unavailable on this device/browser.");
      setBatteryPercent(null);
      return;
    }

    let detached = false;
    let batteryManager: {
      level: number;
      addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
      removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
    } | null = null;

    const normalizeBatteryPercent = (level: number) => {
      if (!Number.isFinite(level)) {
        console.warn("[pindou] getBattery returned a non-finite level.", { level });
        return null;
      }

      const nextPercent = Math.round(level * 100);
      if (!Number.isFinite(nextPercent) || nextPercent < 0 || nextPercent > 100) {
        console.warn("[pindou] getBattery returned an out-of-range level.", {
          level,
          nextPercent,
        });
        return null;
      }

      return nextPercent;
    };

    const syncBattery = () => {
      if (!batteryManager || detached) {
        return;
      }
      setBatteryPercent(normalizeBatteryPercent(batteryManager.level));
    };

    void batteryGetter.call(navigator).then((battery) => {
      if (detached) {
        return;
      }
      batteryManager = battery;
      console.info("[pindou] getBattery resolved.", {
        level: battery.level,
      });
      syncBattery();
      batteryManager.addEventListener?.("levelchange", syncBattery);
    }).catch((error) => {
      console.error("[pindou] getBattery failed.", error);
      if (!detached) {
        setBatteryPercent(null);
      }
    });

    return () => {
      detached = true;
      batteryManager?.removeEventListener?.("levelchange", syncBattery);
    };
  }, [focusOnly, isMobileUserAgent]);

  const useLandscapeColorRail = isLandscapeViewport;
  const focusColorRailWidth = 220;
  const colorRailHint = t.pindouModeHint;
  const showExpandedFocusToolbar = focusOnly && !useCompactLandscapeFocusToolbar;

  return (
    <section
      className={clsx(
        "min-h-0 min-w-0 w-full self-stretch",
        focusOnly
          ? "relative flex h-screen w-full flex-col overflow-hidden"
          : "flex h-full flex-col overflow-hidden",
      )}
    >
      {showExpandedFocusToolbar ? (
        <div className="pointer-events-none absolute left-3 right-3 top-0 z-30 flex flex-wrap justify-center gap-2">
          {isMobileUserAgent ? (
            <div className={clsx("pointer-events-auto flex h-10 items-center gap-2 rounded-md border px-2 py-0.5 shadow-sm backdrop-blur", theme.pill)}>
              {batteryPercent !== null ? <BatteryStatusIcon className="h-4 w-8" percent={batteryPercent} /> : null}
              <span className={clsx("whitespace-nowrap text-sm font-semibold tabular-nums", theme.cardTitle)}>
                {currentClock}
              </span>
            </div>
          ) : null}
          {useCompactLandscapeFocusToolbar ? (
            <button
              aria-label={t.toolLabel}
              className={clsx("pointer-events-auto flex h-10 w-10 items-center justify-center rounded-md border shadow-sm backdrop-blur transition", theme.pill)}
              onClick={() => setFocusToolbarMenuOpen((value) => !value)}
              title={t.toolLabel}
              type="button"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          ) : null}
          <div className={clsx("pointer-events-auto flex h-10 items-center gap-1 rounded-md border pl-1 pr-0.5 py-0.5 shadow-sm backdrop-blur", theme.pill)}>
            <BlinkingTimerText
              className={clsx("min-w-[56px] px-2 text-center text-xs font-semibold", theme.cardTitle)}
              value={timerDisplay}
              colonVisible={timerColonVisible}
            />
            <button
              className={clsx("flex h-8 w-8 items-center justify-center rounded-md transition", theme.pill)}
              onClick={onPindouTimerToggle}
              title={pindouTimerRunning ? timerPauseLabel : timerStartLabel}
              type="button"
            >
              {pindouTimerRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              className={clsx("flex h-8 w-8 items-center justify-center rounded-md transition", theme.pill)}
              onClick={onPindouTimerReset}
              title={timerResetLabel}
              type="button"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
          {!usePortraitMobileFocusZoomBar ? (
            <div className={clsx("pointer-events-auto flex h-10 items-center rounded-md border p-0.5 shadow-sm backdrop-blur", theme.pill)}>
              <button
                className={clsx("flex h-8 w-8 items-center justify-center rounded-md transition", theme.pill)}
                onClick={() => onPindouZoomChange(clampPindouZoom(pindouZoom - 0.2))}
                title="-"
                type="button"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className={clsx("w-12 text-center text-xs font-semibold", theme.cardTitle)}>
                {Math.round(pindouZoom * 100)}%
              </span>
              <button
                className={clsx("flex h-8 w-8 items-center justify-center rounded-md transition", theme.pill)}
                onClick={() => onPindouZoomChange(clampPindouZoom(pindouZoom + 0.2))}
                title="+"
                type="button"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          <button
            className={clsx(
              "pointer-events-auto flex h-10 w-10 items-center justify-center rounded-md border shadow-sm backdrop-blur transition",
              pindouFlipHorizontal ? theme.controlButtonActive : theme.pill,
            )}
            onClick={() => onPindouFlipHorizontalChange(!pindouFlipHorizontal)}
            title={flipHorizontalLabel}
            type="button"
          >
            <FlipHorizontal className="h-4 w-4" />
          </button>
          <button
            className={clsx(
              "pointer-events-auto flex h-10 w-10 items-center justify-center rounded-md border shadow-sm backdrop-blur transition",
              pindouShowLabels ? theme.controlButtonActive : theme.pill,
            )}
            onClick={() => onPindouShowLabelsChange(!pindouShowLabels)}
            title={showLabelsLabel}
            type="button"
          >
            <TypeIcon className="h-4 w-4" />
          </button>
          <div className={clsx("pointer-events-auto flex h-10 items-center gap-1 rounded-md border px-1 py-0.5 shadow-sm backdrop-blur", theme.pill)}>
            <PindouBeadShapeButtons
              isDark={isDark}
              selectedShape={pindouBeadShape}
              labels={beadShapeLabels}
              groupLabel={beadShapeLabel}
              onChange={onPindouBeadShapeChange}
            />
          </div>
          <div className={clsx("pointer-events-auto flex h-10 items-center gap-1 rounded-md border px-1 py-0.5 shadow-sm backdrop-blur", theme.pill)}>
            <PindouBoardThemeButtons
              isDark={isDark}
              selectedTheme={pindouBoardTheme}
              labels={boardThemeLabels}
              groupLabel={boardThemeLabel}
              onChange={onPindouBoardThemeChange}
            />
          </div>
          <button
            className={clsx("pointer-events-auto flex h-10 w-10 items-center justify-center rounded-md border shadow-sm backdrop-blur transition", theme.pill)}
            onClick={() => onFocusViewOpenChange(false)}
            title={t.pindouExitFocus}
            type="button"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {!focusOnly ? (
        <>
          <div
            className={clsx(
              "flex min-w-0 flex-wrap items-center gap-2 px-2 py-3 sm:px-2 sm:py-4 lg:px-1.5",
              theme.subtlePanel,
            )}
          >
            <div className={clsx("flex h-10 shrink-0 items-center gap-1 rounded-md border pl-1 pr-0.5 py-0.5", theme.pill)}>
              <BlinkingTimerText
                className={clsx("min-w-[56px] px-2 text-center text-xs font-semibold", theme.cardTitle)}
                value={timerDisplay}
                colonVisible={timerColonVisible}
              />
              <button
                className={clsx("flex h-8 w-8 items-center justify-center rounded-md transition", theme.pill)}
                onClick={onPindouTimerToggle}
                title={pindouTimerRunning ? timerPauseLabel : timerStartLabel}
                type="button"
              >
                {pindouTimerRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button
                className={clsx("flex h-8 w-8 items-center justify-center rounded-md transition", theme.pill)}
                onClick={onPindouTimerReset}
                title={timerResetLabel}
                type="button"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
            <div className={clsx("flex h-10 shrink-0 items-center rounded-md border p-0.5", theme.pill)}>
              <button
                className={clsx("flex h-8 w-8 items-center justify-center rounded-md transition", theme.pill)}
                onClick={() => onPindouZoomChange(clampPindouZoom(pindouZoom - 0.2))}
                title="-"
                type="button"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className={clsx("w-12 text-center text-xs font-semibold", theme.cardTitle)}>
                {Math.round(pindouZoom * 100)}%
              </span>
              <button
                className={clsx("flex h-8 w-8 items-center justify-center rounded-md transition", theme.pill)}
                onClick={() => onPindouZoomChange(clampPindouZoom(pindouZoom + 0.2))}
                title="+"
                type="button"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <button
              className={clsx(
                "flex h-10 w-10 items-center justify-center rounded-md border transition",
                pindouFlipHorizontal ? theme.controlButtonActive : theme.pill,
              )}
              onClick={() => onPindouFlipHorizontalChange(!pindouFlipHorizontal)}
              title={flipHorizontalLabel}
              type="button"
            >
              <FlipHorizontal className="h-4 w-4" />
            </button>
            <button
              className={clsx(
                "flex h-10 w-10 items-center justify-center rounded-md border transition",
                pindouShowLabels ? theme.controlButtonActive : theme.pill,
              )}
              onClick={() => onPindouShowLabelsChange(!pindouShowLabels)}
              title={showLabelsLabel}
              type="button"
            >
              <TypeIcon className="h-4 w-4" />
            </button>
            <div className={clsx("flex h-10 shrink-0 items-center gap-1 rounded-md border px-1 py-0.5", theme.pill)}>
              <PindouBeadShapeButtons
                isDark={isDark}
                selectedShape={pindouBeadShape}
                labels={beadShapeLabels}
                groupLabel={beadShapeLabel}
                onChange={onPindouBeadShapeChange}
              />
            </div>
            <div className={clsx("flex h-10 shrink-0 items-center gap-1 rounded-md border px-1 py-0.5", theme.pill)}>
              <PindouBoardThemeButtons
                isDark={isDark}
                selectedTheme={pindouBoardTheme}
                labels={boardThemeLabels}
                groupLabel={boardThemeLabel}
                onChange={onPindouBoardThemeChange}
              />
            </div>
            <button
              className={clsx("flex h-10 shrink-0 items-center gap-2 rounded-md border px-3 transition", theme.pill)}
              onClick={() => onFocusViewOpenChange(!focusViewOpen)}
              title={t.pindouFocusView}
              type="button"
            >
              <Maximize2 className="h-4 w-4" />
              <span className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.pindouFocusView}</span>
            </button>
          </div>
          <div className={clsx("h-px w-full shrink-0", theme.divider)} />
        </>
      ) : null}

      <div className="relative min-h-0 min-w-0 flex-1">
        {useLandscapeColorRail ? (
          <div className="flex h-full min-h-0 min-w-0 items-stretch gap-0">
            <aside
              className={clsx(
                "relative min-h-0 shrink-0 p-2",
                focusOnly
                  ? "rounded-[10px] rounded-r-none shadow-sm backdrop-blur"
                  : "rounded-none border-r",
                focusOnly ? theme.panel : theme.previewStage,
                focusOnly ? "border" : (isDark ? "border-white/14" : "border-stone-300"),
              )}
              style={{ width: `${focusColorRailWidth}px` }}
            >
              <div className={clsx("flex h-full min-h-0 flex-col", focusOnly && !useCompactLandscapeFocusToolbar ? "justify-center" : "")}>
                {focusOnly && useCompactLandscapeFocusToolbar ? (
                  <div className="relative z-20 shrink-0">
                    <div
                      className={clsx(
                        "relative flex h-10 items-center border px-2 shadow-sm backdrop-blur",
                        focusToolbarMenuOpen ? "rounded-t-md rounded-b-none" : "rounded-md",
                        theme.pill,
                      )}
                    >
                      <div className="flex min-w-[104px] items-center">
                        <div className="flex min-w-0 flex-col justify-center gap-0.5 leading-none">
                          {isMobileUserAgent && batteryPercent !== null ? (
                            <BatteryStatusIcon
                              className={clsx(showPinnedTimerSummary ? "h-3.5 w-7" : "h-4 w-8")}
                              percent={batteryPercent}
                            />
                          ) : null}
                          {showPinnedTimerSummary ? (
                            <div className="flex h-5 min-w-0 items-center gap-1">
                              <button
                                className="min-w-0"
                                onClick={onPindouTimerToggle}
                                title={pindouTimerRunning ? timerPauseLabel : timerStartLabel}
                                type="button"
                              >
                                <BlinkingTimerText
                                  className={clsx(
                                    "h-5 min-w-0 text-left font-semibold leading-none tabular-nums",
                                    isMobileUserAgent && batteryPercent !== null ? "text-[10px]" : "text-sm",
                                    theme.cardTitle,
                                  )}
                                  value={timerDisplay}
                                  colonVisible={timerColonVisible}
                                />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-12">
                        <span className={clsx("min-w-0 whitespace-nowrap text-center text-[11px] font-semibold tabular-nums sm:text-sm", theme.cardTitle)}>
                          {currentClock}
                        </span>
                      </div>
                      <div className="ml-auto flex w-10 items-center justify-end">
                        <button
                          aria-label={t.toolLabel}
                          className={clsx("flex h-8 w-8 items-center justify-center rounded-md transition", theme.pill)}
                          onClick={() => setFocusToolbarMenuOpen((value) => !value)}
                          title={t.toolLabel}
                          type="button"
                        >
                          <SlidersHorizontal className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {focusToolbarMenuOpen ? (
                      <div className={clsx("absolute right-0 top-full -mt-px flex w-full min-w-0 flex-col gap-1.5 rounded-b-md rounded-t-none border border-t-0 p-1.5 shadow-sm backdrop-blur", theme.panel, isDark ? "border-white/14" : "border-stone-300")}>
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
                          <div className={clsx("flex h-9 items-center gap-1 rounded-md border px-1 py-0.5", theme.pill)}>
                            <button
                              className="flex h-7 min-w-0 flex-1 items-center justify-center"
                              onClick={onPindouTimerToggle}
                              title={pindouTimerRunning ? timerPauseLabel : timerStartLabel}
                              type="button"
                            >
                              <BlinkingTimerText
                                className={clsx("min-w-[52px] px-1.5 text-center text-xs font-semibold leading-none", theme.cardTitle)}
                                value={timerDisplay}
                                colonVisible={timerColonVisible}
                              />
                            </button>
                            <button
                              className={clsx("flex h-7 w-7 items-center justify-center rounded-md transition", theme.pill)}
                              onClick={onPindouTimerToggle}
                              title={pindouTimerRunning ? timerPauseLabel : timerStartLabel}
                              type="button"
                            >
                              {pindouTimerRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              className={clsx("flex h-7 w-7 items-center justify-center rounded-md transition", theme.pill)}
                              onClick={onPindouTimerReset}
                              title={timerResetLabel}
                              type="button"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className={clsx("flex h-9 items-center rounded-md border p-0.5", theme.pill)}>
                            <PindouBeadShapeButtons
                              isDark={isDark}
                              selectedShape={pindouBeadShape}
                              labels={beadShapeLabels}
                              groupLabel={beadShapeLabel}
                              onChange={onPindouBeadShapeChange}
                            />
                          </div>
                        </div>
                        <div className={clsx("flex h-9 min-w-0 items-center gap-1 rounded-md border px-1 py-0.5", theme.pill)}>
                          <button
                            className={clsx("flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition", theme.pill)}
                            onClick={() => onPindouZoomChange(clampPindouZoom(pindouZoom - 0.2))}
                            title="-"
                            type="button"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className={clsx("min-w-0 flex-1 text-center text-xs font-semibold", theme.cardTitle)}>
                            {Math.round(pindouZoom * 100)}%
                          </span>
                          <button
                            className={clsx("flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition", theme.pill)}
                            onClick={() => onPindouZoomChange(clampPindouZoom(pindouZoom + 0.2))}
                            title="+"
                            type="button"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className={clsx("flex h-9 items-center gap-1 rounded-md border px-1 py-0.5", theme.pill)}>
                          <PindouBoardThemeButtons
                            isDark={isDark}
                            selectedTheme={pindouBoardTheme}
                            labels={boardThemeLabels}
                            groupLabel={boardThemeLabel}
                            onChange={onPindouBoardThemeChange}
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            className={clsx(
                              "flex h-9 items-center justify-center rounded-md border transition",
                              pindouFlipHorizontal ? theme.controlButtonActive : theme.pill,
                            )}
                            onClick={() => onPindouFlipHorizontalChange(!pindouFlipHorizontal)}
                            title={flipHorizontalLabel}
                            type="button"
                          >
                            <FlipHorizontal className="h-4 w-4" />
                          </button>
                          <button
                            className={clsx(
                              "flex h-9 items-center justify-center rounded-md border transition",
                              pindouShowLabels ? theme.controlButtonActive : theme.pill,
                            )}
                            onClick={() => onPindouShowLabelsChange(!pindouShowLabels)}
                            title={showLabelsLabel}
                            type="button"
                          >
                            <TypeIcon className="h-4 w-4" />
                          </button>
                          <button
                            className={clsx("flex h-9 items-center justify-center rounded-md border transition", theme.pill)}
                            onClick={() => onFocusViewOpenChange(false)}
                            title={t.pindouExitFocus}
                            type="button"
                          >
                            <Minimize2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className={clsx("min-h-0", focusOnly && !useCompactLandscapeFocusToolbar ? "flex flex-1 items-center" : "flex-1")}>
                  <div className="grid max-h-full w-full grid-cols-2 content-start gap-2 overflow-y-auto pr-1">
                    {pindouColors.map((color) => {
                      const active = focusedSketchLabel === color.label;
                      return (
                        <button
                          key={color.label}
                          className={clsx(
                            "flex min-w-0 items-center gap-2 rounded-md border px-2 py-2 transition-colors",
                            active ? theme.controlButtonActive : theme.pill,
                          )}
                          onClick={() => onFocusedSketchLabelChange(active ? null : color.label)}
                          type="button"
                          title={color.label}
                        >
                          <span
                            className="h-4 w-4 shrink-0 rounded-full border border-black/10"
                            style={{ backgroundColor: color.hex }}
                          />
                          <span className="min-w-0 truncate text-xs font-semibold">
                            {color.label}
                          </span>
                          <span className={clsx("ml-auto shrink-0 text-[11px]", active ? "" : theme.cardMuted)}>
                            {color.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className={clsx("mt-3 px-1 text-xs", theme.cardMuted)}>{colorRailHint}</p>
              </div>
            </aside>

            <div className="flex h-full min-h-0 min-w-0 flex-1">
              <CanvasStage
                cells={cells}
                gridWidth={gridWidth}
                gridHeight={gridHeight}
                emptyPixelLabel={t.emptyPixel}
                inputUrl={null}
                overlayCropRect={null}
                overlayEnabled={false}
                isDark={isDark}
                stageMode="pindou"
                focusedLabel={focusedSketchLabel}
                onFocusLabelChange={onFocusedSketchLabelChange}
                paintActiveRef={paintActiveRef}
                focusOnly={focusOnly}
                flipHorizontal={pindouFlipHorizontal}
                showPindouLabels={pindouShowLabels}
                pindouBeadShape={pindouBeadShape}
                pindouBoardTheme={pindouBoardTheme}
                pindouZoom={pindouZoom}
                onPindouZoomChange={onPindouZoomChange}
                busy={busy}
                viewportClassName={useLandscapeColorRail ? "rounded-l-none" : undefined}
                embeddedInPanel={!focusOnly}
                onPindouStageTap={useCompactLandscapeFocusToolbar ? () => setFocusToolbarMenuOpen(false) : undefined}
              />
            </div>
          </div>
        ) : (
          <div className="relative flex h-full min-h-0 min-w-0">
            <CanvasStage
              cells={cells}
              gridWidth={gridWidth}
              gridHeight={gridHeight}
              emptyPixelLabel={t.emptyPixel}
              inputUrl={null}
              overlayCropRect={null}
              overlayEnabled={false}
              isDark={isDark}
              stageMode="pindou"
              focusedLabel={focusedSketchLabel}
              onFocusLabelChange={onFocusedSketchLabelChange}
              paintActiveRef={paintActiveRef}
              focusOnly={focusOnly}
              flipHorizontal={pindouFlipHorizontal}
              showPindouLabels={pindouShowLabels}
              pindouBeadShape={pindouBeadShape}
              pindouBoardTheme={pindouBoardTheme}
              pindouZoom={pindouZoom}
              onPindouZoomChange={onPindouZoomChange}
              busy={busy}
              embeddedInPanel={!focusOnly}
              onPindouStageTap={useCompactLandscapeFocusToolbar ? () => setFocusToolbarMenuOpen(false) : undefined}
            />
            {usePortraitMobileFocusZoomBar ? (
              <div
                className={clsx(
                  "absolute inset-x-0 bottom-3 z-20 flex justify-center transition-opacity duration-300",
                  portraitFocusZoomBarVisible ? "pointer-events-none opacity-100" : "pointer-events-none opacity-0",
                )}
              >
                <div className={clsx("pointer-events-auto flex h-10 min-w-[148px] items-center rounded-md border p-0.5 shadow-sm backdrop-blur", theme.pill)}>
                  <button
                    className={clsx("flex h-8 w-8 items-center justify-center rounded-md transition", theme.pill)}
                    onClick={() => onPindouZoomChange(clampPindouZoom(pindouZoom - 0.2))}
                    title="-"
                    type="button"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className={clsx("min-w-0 flex-1 text-center text-xs font-semibold", theme.cardTitle)}>
                    {Math.round(pindouZoom * 100)}%
                  </span>
                  <button
                    className={clsx("flex h-8 w-8 items-center justify-center rounded-md transition", theme.pill)}
                    onClick={() => onPindouZoomChange(clampPindouZoom(pindouZoom + 0.2))}
                    title="+"
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {!useLandscapeColorRail ? (
        <div
          className={clsx(
            "flex w-full min-w-0 self-stretch flex-wrap gap-2 overflow-auto pr-1",
            focusOnly ? "mt-2" : "mt-4",
            focusOnly ? "max-h-[168px] shrink-0 justify-center" : "max-h-[220px]",
          )}
        >
        {pindouColors.map((color) => {
          const active = focusedSketchLabel === color.label;
          return (
            <button
              key={color.label}
              className={clsx(
                "flex items-center gap-3 rounded-md border px-3 py-2 transition-colors",
                active ? theme.controlButtonActive : theme.pill,
              )}
              onClick={() => onFocusedSketchLabelChange(active ? null : color.label)}
              type="button"
              title={color.label}
            >
              <span
                className="h-5 w-5 rounded-full border border-black/10"
                style={{ backgroundColor: color.hex }}
              />
              <span className={clsx("text-sm font-semibold", active ? "" : theme.cardTitle)}>
                {color.label}
              </span>
              <span className={clsx("text-xs", active ? "" : theme.cardMuted)}>{color.count}</span>
            </button>
          );
        })}
        </div>
      ) : null}
      {!useLandscapeColorRail && !focusOnly ? (
        <p className={clsx("mt-3 text-xs", theme.cardMuted)}>{t.pindouModeHint}</p>
      ) : null}
    </section>
  );
}

function ContextToolStrip({
  t,
  isDark,
  editTool,
  editFlipHorizontal,
  selectedLabel,
  selectedHex,
  paletteOptions,
  brushSize,
  onBrushSizeChange,
  editZoom,
  onEditZoomChange,
  onEditFlipHorizontalChange,
  fillTolerance,
  onFillToleranceChange,
  onEditToolChange,
  onSelectedLabelChange,
  canvasCropSelection,
  gridWidth,
  gridHeight,
  onCanvasCropConfirm,
  onCanvasCropCancel,
  showFlipButton = true,
}: {
  t: Messages;
  isDark: boolean;
  editTool: EditTool;
  editFlipHorizontal: boolean;
  selectedLabel: string;
  selectedHex: string | null;
  paletteOptions: Array<{ label: string; hex: string }>;
  brushSize: number;
  onBrushSizeChange: (value: number) => void;
  editZoom: number;
  onEditZoomChange: (value: number) => void;
  onEditFlipHorizontalChange: (value: boolean) => void;
  fillTolerance: number;
  onFillToleranceChange: (value: number) => void;
  onEditToolChange: (tool: EditTool) => void;
  onSelectedLabelChange: (label: string) => void;
  canvasCropSelection: CanvasCropRect | null;
  gridWidth: number;
  gridHeight: number;
  onCanvasCropConfirm: () => void | Promise<void>;
  onCanvasCropCancel: () => void;
  showFlipButton?: boolean;
}) {
  const theme = getThemeClasses(isDark);
  const flipHorizontalLabel = t.pindouFlipHorizontal ?? "Flip Horizontally";
  const shellRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [popupStyle, setPopupStyle] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const showPalette = editTool === "paint" || editTool === "fill";
  const showBrushSize = editTool === "paint" || editTool === "erase";
  const showFillThreshold = editTool === "fill";
  const showZoomControls = editTool === "zoom";
  const showCropActions = editTool === "crop";
  const canConfirmCanvasCrop = !isFullCanvasCropRect(canvasCropSelection, gridWidth, gridHeight);
  const filteredPaletteOptions = useMemo(() => {
    const query = filterText.trim().toUpperCase();
    const source = [
      { label: EMPTY_SELECTION_LABEL, displayLabel: t.emptyPixel, hex: null },
      ...paletteOptions.map((option) => ({
        label: option.label,
        displayLabel: option.label,
        hex: option.hex,
      })),
    ];
    if (!query) {
      return source;
    }
    return source.filter((option) => option.displayLabel.toUpperCase().includes(query));
  }, [filterText, paletteOptions, t.emptyPixel]);

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }

    function syncPopupPosition() {
      if (!triggerRef.current || !shellRef.current) {
        return;
      }

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const shellRect = shellRef.current.getBoundingClientRect();
      const width = Math.min(448, Math.max(320, shellRect.width - 8));
      const height = Math.min(480, Math.max(260, window.innerHeight - triggerRect.bottom - 32));
      const idealLeft = triggerRect.left - shellRect.left;
      const left = Math.max(0, Math.min(idealLeft, shellRect.width - width));
      const top = triggerRect.bottom - shellRect.top + 8;
      setPopupStyle({ left, top, width, height });
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        !popupRef.current?.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      ) {
        setPickerOpen(false);
      }
    }

    syncPopupPosition();
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", syncPopupPosition);
    rowRef.current?.addEventListener("scroll", syncPopupPosition, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", syncPopupPosition);
      rowRef.current?.removeEventListener("scroll", syncPopupPosition);
    };
  }, [pickerOpen]);

  return (
    <div
      ref={shellRef}
      data-edit-toolstrip-shell="true"
      className="relative min-w-0 w-full max-w-full overflow-visible"
    >
      <div
        ref={rowRef}
        className="flex min-h-10 min-w-0 flex-wrap items-center gap-2 overflow-visible sm:flex-nowrap"
      >
        {showCropActions ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <button
              className={clsx(
                "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition",
                theme.pill,
              )}
              onClick={onCanvasCropCancel}
              type="button"
            >
              <X className="h-4 w-4" />
              <span>{t.canvasCropCancel}</span>
            </button>
            <button
              className={clsx(
                "inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition",
                canConfirmCanvasCrop ? theme.primaryButton : theme.disabledButton,
              )}
              disabled={!canConfirmCanvasCrop}
              onClick={() => {
                void onCanvasCropConfirm();
              }}
              type="button"
            >
              <Check className="h-4 w-4" />
              <span>{t.canvasCropConfirm}</span>
            </button>
          </div>
        ) : null}
        {showPalette ? (
          <ColorPickerPopup
            t={t}
            isDark={isDark}
            selectedLabel={selectedLabel}
            selectedHex={selectedHex}
            open={pickerOpen}
            triggerRef={triggerRef}
            setOpen={setPickerOpen}
          />
        ) : null}
        {showBrushSize ? (
          <InlineSliderField
            id="brush-size"
            isDark={isDark}
            label={t.brushSize}
            max={12}
            min={1}
            step={1}
            value={brushSize}
            onValueChange={onBrushSizeChange}
          />
        ) : null}
        {showFillThreshold ? (
          <InlineSliderField
            id="fill-threshold"
            isDark={isDark}
            label={t.fillThreshold}
            max={255}
            min={0}
            step={1}
            value={fillTolerance}
            onValueChange={onFillToleranceChange}
          />
        ) : null}
        {showZoomControls ? (
          <div className={clsx("flex h-10 items-center gap-1 rounded-md border px-1 py-0.5", theme.pill)}>
            <button
              className={clsx("flex h-8 w-8 items-center justify-center rounded-md transition", theme.pill)}
              onClick={() => onEditZoomChange(clampEditorZoom(editZoom - 0.2))}
              title="-"
              type="button"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className={clsx("w-12 text-center text-xs font-semibold", theme.cardTitle)}>
              {Math.round(editZoom * 100)}%
            </span>
            <button
              className={clsx("flex h-8 w-8 items-center justify-center rounded-md transition", theme.pill)}
              onClick={() => onEditZoomChange(clampEditorZoom(editZoom + 0.2))}
              title="+"
              type="button"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        {showFlipButton ? (
          <button
            className={clsx(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition",
              editFlipHorizontal ? theme.controlButtonActive : theme.pill,
            )}
            onClick={() => onEditFlipHorizontalChange(!editFlipHorizontal)}
            title={flipHorizontalLabel}
            type="button"
          >
            <FlipHorizontal className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {showPalette && pickerOpen && popupStyle ? (
        <ColorPickerPanel
          t={t}
          isDark={isDark}
          selectedLabel={selectedLabel}
          filterText={filterText}
          options={filteredPaletteOptions}
          onFilterTextChange={setFilterText}
          onSelectLabel={(label) => {
            onEditToolChange(editTool === "fill" ? "fill" : "paint");
            onSelectedLabelChange(label);
            setPickerOpen(false);
          }}
          popupRef={popupRef}
          popupStyle={popupStyle}
        />
      ) : null}
    </div>
  );
}

