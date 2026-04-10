import * as Tabs from "@radix-ui/react-tabs";
import * as Slider from "@radix-ui/react-slider";
import clsx from "clsx";
import { createPortal } from "react-dom";
import {
  Circle,
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
  Square,
  Type as TypeIcon,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { CanvasEditorStage, clampEditorZoom, clampPindouZoom } from "./canvas-editor-stage";
import { SwitchRow } from "./controls";
import type { Messages } from "../lib/i18n";
import { colorSystemOptions, measureHexDistance255, type EditableCell, type NormalizedCropRect } from "../lib/mard";
import { getPindouBoardThemeShades, pindouBoardThemes, type PindouBeadShape, type PindouBoardTheme } from "../lib/pindou-board-theme";
import { getThemeClasses } from "../lib/theme";

type EditTool = "paint" | "erase" | "pick" | "fill" | "pan" | "zoom";
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
  onColorSystemIdChange,
  paletteOptions,
  onSelectedLabelChange,
  onApplyCell,
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
  chartSaveMetadata,
  onChartSaveMetadataChange,
  chartIncludeGuides,
  onChartIncludeGuidesChange,
  chartIncludeBoardPattern,
  onChartIncludeBoardPatternChange,
  chartBoardTheme,
  onChartBoardThemeChange,
  chartIncludeLegend,
  onChartIncludeLegendChange,
  chartPreviewUrl,
  chartPreviewBusy,
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
  onColorSystemIdChange: (value: string) => void;
  paletteOptions: Array<{ label: string; hex: string }>;
  onSelectedLabelChange: (label: string) => void;
  onApplyCell: (index: number, toolOverride?: EditTool) => void;
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
  chartSaveMetadata: boolean;
  onChartSaveMetadataChange: (value: boolean) => void;
  chartIncludeGuides: boolean;
  onChartIncludeGuidesChange: (value: boolean) => void;
  chartIncludeBoardPattern: boolean;
  onChartIncludeBoardPatternChange: (value: boolean) => void;
  chartBoardTheme: PindouBoardTheme;
  onChartBoardThemeChange: (value: PindouBoardTheme) => void;
  chartIncludeLegend: boolean;
  onChartIncludeLegendChange: (value: boolean) => void;
  chartPreviewUrl: string | null;
  chartPreviewBusy: boolean;
  onSaveChart: () => void | Promise<void>;
  saveBusy: boolean;
}) {
  const theme = getThemeClasses(isDark);
  const flipHorizontalLabel = t.pindouFlipHorizontal ?? "Flip Horizontally";
  const panLabel = t.toolPan ?? "骞崇Щ";
  const zoomLabel = t.toolZoom ?? "缂╂斁";
  const panelBodyRef = useRef<HTMLElement | null>(null);
  const [panelMode, setPanelMode] = useState<EditorPanelMode>(focusOnly ? "pindou" : preferredMode);
  const [focusedSketchLabel, setFocusedSketchLabel] = useState<string | null>(null);
  const [panelViewportHeight, setPanelViewportHeight] = useState(0);
  const activeMatchedColorCount = matchedColors.filter(
    (color) => !disabledResultLabels.includes(color.label),
  ).length;
  const pindouColors = useMemo(
    () => summarizeStageColors(cells, paletteOptions),
    [cells, paletteOptions],
  );
  const topTabClassName = (active: boolean) =>
    clsx(
      "inline-flex h-10 shrink-0 items-center justify-center rounded-t-[10px] px-4 text-sm font-semibold leading-none outline-none transition",
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
            "opacity-100 hover:brightness-95",
          ),
    );

  const tools: Array<{
    id: EditTool;
    label: string;
    icon: typeof Pencil;
  }> = [
    { id: "pan", label: panLabel, icon: Hand },
    { id: "zoom", label: zoomLabel, icon: Search },
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
    if (focusOnly && panelMode !== "pindou") {
      setPanelMode("pindou");
    }
  }, [focusOnly, panelMode]);

  useEffect(() => {
    if (!focusOnly) {
      setPanelMode(preferredMode);
    }
  }, [focusOnly, preferredMode, preferredModeSeed]);

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
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      value={panelMode}
      onValueChange={(value) => {
        const nextMode = value as EditorPanelMode;
        setPanelMode(nextMode);
        onPreferredModeChange?.(nextMode);
      }}
    >
      <div className="relative z-10 mb-[-1px] flex min-w-0 items-end justify-between gap-3">
        <Tabs.List className="scrollbar-none flex min-w-0 items-end gap-1 overflow-x-auto overflow-y-hidden">
          {([
            ["edit", t.editorTabEdit],
            ["pindou", t.editorTabPindou],
          ] as const).map(([value, label]) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className={topTabClassName(panelMode === value)}
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="flex shrink-0 items-end gap-1">
          <Tabs.List className="flex shrink-0 items-end">
            <Tabs.Trigger
              className={topTabClassName(panelMode === "chart")}
              value="chart"
            >
              {t.editorTabChartSettings}
            </Tabs.Trigger>
          </Tabs.List>
          <button
            className={clsx(
              "shrink-0 rounded-t-[10px] border px-4 py-2 text-sm font-semibold transition",
              resultReady && !saveBusy && !busy ? theme.primaryButton : theme.disabledButton,
            )}
            disabled={!resultReady || saveBusy || busy}
            onClick={() => void onSaveChart()}
            type="button"
          >
            {t.downloadPng}
          </button>
        </div>
      </div>

      <section
        ref={panelBodyRef}
        className={clsx("flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] rounded-tl-none rounded-tr-none border backdrop-blur transition-colors sm:rounded-[16px] sm:rounded-tl-none sm:rounded-tr-none xl:rounded-[18px] xl:rounded-tl-none xl:rounded-tr-none", theme.panel)}
        style={panelViewportHeight > 0 ? { height: `${panelViewportHeight}px`, minHeight: `${panelViewportHeight}px` } : undefined}
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
                <CanvasEditorStage
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

        <Tabs.Content value="chart" className="flex min-h-0 flex-1">
          <ChartSettingsTab
            t={t}
            isDark={isDark}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
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
            chartIncludeGuides={chartIncludeGuides}
            onChartIncludeGuidesChange={onChartIncludeGuidesChange}
            chartIncludeBoardPattern={chartIncludeBoardPattern}
            onChartIncludeBoardPatternChange={onChartIncludeBoardPatternChange}
            chartBoardTheme={chartBoardTheme}
            onChartBoardThemeChange={onChartBoardThemeChange}
            chartIncludeLegend={chartIncludeLegend}
            onChartIncludeLegendChange={onChartIncludeLegendChange}
            chartPreviewUrl={chartPreviewUrl}
            chartPreviewBusy={chartPreviewBusy}
          />
        </Tabs.Content>
      </section>
    </Tabs.Root>
    )
  );
}

function ChartSettingsTab({
  t,
  isDark,
  gridWidth,
  gridHeight,
  chartExportTitle,
  onChartExportTitleChange,
  chartWatermarkText,
  onChartWatermarkTextChange,
  chartWatermarkImageDataUrl,
  chartWatermarkImageName,
  onChartWatermarkImageFile,
  onChartWatermarkImageClear,
  chartSaveMetadata,
  onChartSaveMetadataChange,
  chartIncludeGuides,
  onChartIncludeGuidesChange,
  chartIncludeBoardPattern,
  onChartIncludeBoardPatternChange,
  chartBoardTheme,
  onChartBoardThemeChange,
  chartIncludeLegend,
  onChartIncludeLegendChange,
  chartPreviewUrl,
  chartPreviewBusy,
}: {
  t: Messages;
  isDark: boolean;
  gridWidth: number;
  gridHeight: number;
  chartExportTitle: string;
  onChartExportTitleChange: (value: string) => void;
  chartWatermarkText: string;
  onChartWatermarkTextChange: (value: string) => void;
  chartWatermarkImageDataUrl: string | null;
  chartWatermarkImageName: string;
  onChartWatermarkImageFile: (file: File | null) => void | Promise<void>;
  onChartWatermarkImageClear: () => void;
  chartSaveMetadata: boolean;
  onChartSaveMetadataChange: (value: boolean) => void;
  chartIncludeGuides: boolean;
  onChartIncludeGuidesChange: (value: boolean) => void;
  chartIncludeBoardPattern: boolean;
  onChartIncludeBoardPatternChange: (value: boolean) => void;
  chartBoardTheme: PindouBoardTheme;
  onChartBoardThemeChange: (value: PindouBoardTheme) => void;
  chartIncludeLegend: boolean;
  onChartIncludeLegendChange: (value: boolean) => void;
  chartPreviewUrl: string | null;
  chartPreviewBusy: boolean;
}) {
  const theme = getThemeClasses(isDark);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chartSectionClassName = clsx(
    "rounded-md border p-3",
    isDark ? "border-white/12 bg-white/[0.035]" : "border-stone-300 bg-white/78",
  );
  const chartPreviewClassName = clsx(
    "relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden rounded-md border p-3",
    isDark ? "border-white/12 bg-white/[0.03]" : "border-stone-300 bg-white/78",
  );
  const boardThemeLabels: Record<PindouBoardTheme, string> = {
    none: t.pindouBoardThemeNone ?? "无底纹",
    gray: t.pindouBoardThemeGray ?? "灰色系",
    green: t.pindouBoardThemeGreen ?? "绿色系",
    pink: t.pindouBoardThemePink ?? "粉色系",
    blue: t.pindouBoardThemeBlue ?? "蓝色系",
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="grid min-h-0 flex-1 gap-5 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.6fr)] sm:px-5 sm:py-5">
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.chartSettingsChartTitle}</span>
            <input
              className={clsx("h-10 rounded-md border px-3 text-sm outline-none transition", theme.input)}
              placeholder={t.chartSettingsChartTitlePlaceholder}
              type="text"
              value={chartExportTitle}
              onChange={(event) => onChartExportTitleChange(event.target.value)}
            />
        </label>

        <label className="flex flex-col gap-2">
          <span className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.chartSettingsWatermarkText}</span>
          <input
            className={clsx("h-10 rounded-md border px-3 text-sm outline-none transition", theme.input)}
            placeholder={t.appTitle}
            type="text"
            value={chartWatermarkText}
            onChange={(event) => onChartWatermarkTextChange(event.target.value)}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.chartSettingsWatermarkImage}</span>
          <input
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            type="file"
            onChange={(event) => void onChartWatermarkImageFile(event.target.files?.[0] ?? null)}
          />
          <div className={clsx("flex flex-wrap items-center gap-2", chartSectionClassName)}>
            {chartWatermarkImageDataUrl ? (
              <img
                alt={chartWatermarkImageName || t.chartSettingsWatermarkImage}
                className="h-14 w-14 rounded-md border object-cover"
                src={chartWatermarkImageDataUrl}
              />
            ) : (
              <div className={clsx("flex h-14 w-14 items-center justify-center rounded-md border text-xs", theme.cardMuted)}>
                PNG
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className={clsx("truncate text-sm font-semibold", theme.cardTitle)}>
                {chartWatermarkImageName || t.chartSettingsNoWatermarkImage}
              </p>
            </div>
            <button
              className={clsx("h-10 rounded-md border px-3 text-sm font-semibold transition", theme.pill)}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {t.chartSettingsChooseWatermarkImage}
            </button>
            {chartWatermarkImageDataUrl ? (
              <button
                className={clsx("h-10 rounded-md border px-3 text-sm font-semibold transition", theme.pill)}
                onClick={onChartWatermarkImageClear}
                type="button"
              >
                {t.chartSettingsClearWatermarkImage}
              </button>
            ) : null}
          </div>
        </div>

        <div className={chartSectionClassName}>
          <SwitchRow
            id="chart-include-guides"
            title={t.chartSettingsIncludeGuides}
            description={t.chartSettingsIncludeGuidesDescription}
            checked={chartIncludeGuides}
            onCheckedChange={onChartIncludeGuidesChange}
            isDark={isDark}
          />
        </div>

        <div className={chartSectionClassName}>
          <div className="flex flex-col gap-3">
            <SwitchRow
              id="chart-include-board-pattern"
              title={t.chartSettingsIncludeBoardPattern}
              description={t.chartSettingsIncludeBoardPatternDescription}
              checked={chartIncludeBoardPattern}
              onCheckedChange={onChartIncludeBoardPatternChange}
              isDark={isDark}
            />
            <div className={clsx("flex items-center gap-2", chartIncludeBoardPattern ? "" : "pointer-events-none opacity-45")}>
              <PindouBoardThemeButtons
                isDark={isDark}
                selectedTheme={chartBoardTheme}
                labels={boardThemeLabels}
                groupLabel={t.pindouBoardThemeLabel ?? "底纹"}
                onChange={onChartBoardThemeChange}
              />
            </div>
          </div>
        </div>

        <div className={chartSectionClassName}>
          <SwitchRow
            id="chart-include-legend"
            title={t.chartSettingsIncludeLegend}
            description={t.chartSettingsIncludeLegendDescription}
            checked={chartIncludeLegend}
            onCheckedChange={onChartIncludeLegendChange}
            isDark={isDark}
          />
        </div>

        <div className={chartSectionClassName}>
          <SwitchRow
            id="chart-save-metadata"
            title={t.chartSettingsSaveMetadata}
            description={t.chartSettingsSaveMetadataDescription}
            checked={chartSaveMetadata}
            onCheckedChange={onChartSaveMetadataChange}
            isDark={isDark}
          />
        </div>
        </div>

        <aside className="flex min-h-0 flex-col gap-2">
          <span className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.chartSettingsPreview}</span>
          <div className={chartPreviewClassName}>
            {chartPreviewUrl ? (
              <img
                alt={t.chartSettingsPreview}
                className="max-h-full max-w-full rounded-sm border object-contain"
                src={chartPreviewUrl}
              />
            ) : (
              <p className={clsx("max-w-[260px] text-center text-sm", theme.cardMuted)}>
                {t.chartSettingsPreviewEmpty}
              </p>
            )}
            {chartPreviewBusy ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/58 backdrop-blur-[1px] dark:bg-black/36">
                <div className="flex w-full max-w-[220px] flex-col items-center px-4">
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
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
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
              <CanvasEditorStage
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
            <CanvasEditorStage
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

function EditResultSummary({
  t,
  isDark,
  matchedColors,
  disabledResultLabels,
  matchedCoveragePercent,
  activeMatchedColorCount,
  colorSystemId,
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

  function closeDetailsPopup() {
    if (leaveTimeoutRef.current !== null) {
      window.clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    if (detailsLeaveTimeoutRef.current !== null) {
      window.clearTimeout(detailsLeaveTimeoutRef.current);
      detailsLeaveTimeoutRef.current = null;
    }
    detailsHoldRef.current = false;
    popupHoldRef.current = false;
    setHoveredLabel(null);
    setHoveredAnchorRect(null);
    setDetailsOpen(false);
  }

  const hoveredOptions = hoveredLabel
    ? nearestReplacementMap.get(hoveredLabel) ?? []
    : [];
  const detailsPopupWidth =
    hostRect === null
      ? 640
      : Math.min(window.innerWidth - 24, Math.max(420, Math.round(hostRect.width)));
  const detailsShowBelow =
    triggerRect !== null
      ? triggerRect.bottom + 248 <= window.innerHeight - 12
      : true;
  const detailsPopupLeft =
    triggerRect === null
      ? 12
      : Math.min(
          window.innerWidth - detailsPopupWidth - 12,
          Math.max(12, triggerRect.left),
        );
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
      : Math.min(
          window.innerWidth - popupWidth - 12,
          Math.max(12, anchorCenterX - popupWidth / 2),
        );
  const showAbove =
    hoveredAnchorRect !== null
      ? hoveredAnchorRect.top - popupHeight - 14 >= 12
      : true;
  const popupTop =
    hoveredAnchorRect === null
      ? 12
      : showAbove
        ? hoveredAnchorRect.top - popupHeight - 14
        : Math.min(
            window.innerHeight - popupHeight - 12,
            Math.max(12, hoveredAnchorRect.bottom + 14),
          );
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
            style={{
              left: `${popupLeft}px`,
              top: `${popupTop}px`,
              width: `${popupWidth}px`,
            }}
          >
            <div className={clsx("mb-2 text-xs font-semibold", theme.cardMuted)}>
              {(t.similarColorsLabel
                ? t.similarColorsLabel(hoveredLabel)
                : t.matchedColorsTitle === "Matched Colors"
                  ? `Colors similar to ${hoveredLabel}`
                  : `和 ${hoveredLabel} 相似的颜色`)}
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
                  className={clsx("h-10 w-full rounded-md border px-3 text-sm outline-none transition", theme.input)}
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
                    <span className={clsx("block truncate text-sm font-semibold", theme.cardTitle)}>{color.label}</span>
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
          detailsOpen ? (detailsShowBelow ? "rounded-[8px] rounded-b-none border-b-transparent" : "rounded-[8px] rounded-t-none border-t-transparent") : "rounded-[8px]",
        )}
        onMouseEnter={openDetailsPopup}
        onMouseLeave={closeDetailsPopupSoon}
        type="button"
      >
        <span className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.labelsCount(activeMatchedColorCount)}</span>
      </button>
      {bridge}
      {detailsPopup}
      {popup}
    </>
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
        <span className={clsx("ml-auto hidden shrink-0 text-xs xl:inline", theme.cardMuted)}>{t.paletteHint}</span>
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

function ColorPickerPopup({
  t,
  isDark,
  selectedLabel,
  selectedHex,
  open,
  triggerRef,
  setOpen,
}: {
  t: Messages;
  isDark: boolean;
  selectedLabel: string;
  selectedHex: string | null;
  open: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  setOpen: (value: boolean) => void;
}) {
  const theme = getThemeClasses(isDark);
  const displayLabel = selectedLabel === EMPTY_SELECTION_LABEL ? t.emptyPixel : selectedLabel;

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        className={clsx(
          "flex h-10 items-center gap-2 rounded-md border px-3 transition",
          open ? theme.controlButtonActive : theme.pill,
        )}
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span
          className="h-4 w-4 rounded-full border border-black/10"
          style={{ backgroundColor: selectedHex ?? "transparent" }}
        />
        <span className={clsx("hidden text-sm font-semibold sm:inline", theme.cardTitle)}>{t.selectedColor}</span>
        <span className={clsx("text-sm font-semibold", theme.cardTitle)}>{displayLabel}</span>
      </button>
    </div>
  );
}

function ColorPickerPanel({
  t,
  isDark,
  selectedLabel,
  filterText,
  options,
  onFilterTextChange,
  onSelectLabel,
  popupRef,
  popupStyle,
}: {
  t: Messages;
  isDark: boolean;
  selectedLabel: string;
  filterText: string;
  options: Array<{ label: string; displayLabel: string; hex: string | null }>;
  onFilterTextChange: (value: string) => void;
  onSelectLabel: (label: string) => void;
  popupRef: RefObject<HTMLDivElement | null>;
  popupStyle: { left: number; top: number; width: number; height: number };
}) {
  const theme = getThemeClasses(isDark);
  const popupInnerHeight = Math.max(220, popupStyle.height - 88);
  const honeycombLayout = useMemo(
    () => buildHoneycombLayout(options, popupStyle.width, popupInnerHeight),
    [options, popupInnerHeight, popupStyle.width],
  );

  return (
    <div
      ref={popupRef}
      className={clsx(
        "absolute z-[80] flex flex-col overflow-hidden rounded-[10px] border p-4 shadow-2xl",
        theme.controlShell,
      )}
      style={{
        left: `${popupStyle.left}px`,
        top: `${popupStyle.top}px`,
        width: `${popupStyle.width}px`,
        height: `${popupStyle.height}px`,
      }}
    >
      <input
        className={clsx("w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition", theme.input)}
        placeholder={t.paletteFilterPlaceholder}
        value={filterText}
        onChange={(event) => onFilterTextChange(event.target.value)}
      />
      <div className="mt-4 min-h-0 flex-1 overflow-auto pr-1">
        {honeycombLayout.cells.length ? (
          <svg
            className="mx-auto block h-auto max-w-full"
            viewBox={`0 0 ${honeycombLayout.width} ${honeycombLayout.height}`}
            xmlns="http://www.w3.org/2000/svg"
          >
            {honeycombLayout.cells.map((cell) => (
              <g
                key={cell.label}
                className="cursor-pointer"
                onClick={() => onSelectLabel(cell.sourceLabel)}
              >
                <title>{cell.label}</title>
                <polygon
                  fill={cell.hex ?? "transparent"}
                  points={cell.points}
                  stroke={isDark ? "rgba(17, 12, 9, 0.48)" : "rgba(255, 255, 255, 0.75)"}
                  strokeWidth={1}
                />
                {!cell.hex ? (
                  <polygon
                    fill="none"
                    points={cell.points}
                    stroke={isDark ? "rgba(168, 162, 158, 0.95)" : "rgba(120, 113, 108, 0.95)"}
                    strokeDasharray="3 2"
                    strokeWidth={1.2}
                  />
                ) : null}
                {selectedLabel === cell.sourceLabel ? (
                  <polygon
                    fill="none"
                    points={cell.points}
                    stroke={isDark ? "#FFFFFF" : "#111111"}
                    strokeWidth={2.6}
                  />
                ) : null}
              </g>
            ))}
          </svg>
        ) : (
          <p className={clsx("px-2 py-3 text-sm", theme.cardMuted)}>{t.paletteHint}</p>
        )}
      </div>
    </div>
  );
}

function getNearestPaletteOptions(
  color: { label: string; hex: string },
  paletteOptions: Array<{ label: string; hex: string }>,
  limit: number,
) {
  return paletteOptions
    .filter((entry) => entry.label !== color.label)
    .map((entry) => ({
      label: entry.label,
      hex: entry.hex,
      distance: measureHexDistance255(color.hex, entry.hex),
    }))
    .sort((left, right) => left.distance - right.distance || left.label.localeCompare(right.label))
    .slice(0, limit)
    .map(({ label, hex }) => ({ label, hex }));
}

function summarizeStageColors(
  cells: EditableCell[],
  paletteOptions: Array<{ label: string; hex: string }>,
) {
  const countMap = new Map<string, number>();
  const paletteMap = new Map(paletteOptions.map((entry) => [entry.label, entry.hex]));

  for (const cell of cells) {
    if (!cell.label || !cell.hex) {
      continue;
    }
    countMap.set(cell.label, (countMap.get(cell.label) ?? 0) + 1);
  }

  return Array.from(countMap.entries())
    .map(([label, count]) => ({
      label,
      count,
      hex: paletteMap.get(label) ?? "#000000",
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function InlineSliderField({
  id,
  label,
  value,
  min,
  max,
  step,
  isDark,
  onValueChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  isDark: boolean;
  onValueChange: (value: number) => void;
}) {
  const theme = getThemeClasses(isDark);
  return (
    <div className={clsx("flex min-w-[116px] shrink-0 items-center gap-2 rounded-md border px-2 py-2 sm:min-w-[210px] sm:gap-3 sm:px-3", theme.pill)}>
      <label className={clsx("hidden shrink-0 text-sm font-semibold sm:inline", theme.cardTitle)} htmlFor={id}>
        {label}
      </label>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Slider.Root
          id={id}
          className="relative flex h-5 min-w-[56px] flex-1 touch-none select-none items-center sm:min-w-[120px]"
          max={max}
          min={min}
          step={step}
          value={[value]}
          onValueChange={(next) => onValueChange(next[0] ?? value)}
        >
          <Slider.Track className={clsx("relative h-2 grow rounded-full", theme.sliderTrack)}>
            <Slider.Range className={clsx("absolute h-full rounded-full", theme.sliderRange)} />
          </Slider.Track>
          <Slider.Thumb className={clsx("block h-5 w-5 rounded-full border shadow outline-none", theme.sliderThumb)} />
        </Slider.Root>
        <span className={clsx("w-7 shrink-0 text-right text-sm font-semibold sm:w-8", theme.cardTitle)}>{value}</span>
      </div>
    </div>
  );
}

function ToolIconButton({
  active,
  disabled,
  icon: Icon,
  isDark,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: typeof Pencil;
  isDark: boolean;
  label: string;
  onClick: () => void;
}) {
  const theme = getThemeClasses(isDark);
  return (
    <button
      className={clsx(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition xl:h-10 xl:w-10",
        disabled ? theme.disabledButton : active ? theme.controlButtonActive : theme.pill,
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function PindouBeadShapeButtons({
  isDark,
  selectedShape,
  labels,
  groupLabel,
  onChange,
}: {
  isDark: boolean;
  selectedShape: PindouBeadShape;
  labels: Record<PindouBeadShape, string>;
  groupLabel: string;
  onChange: (value: PindouBeadShape) => void;
}) {
  const theme = getThemeClasses(isDark);
  const shapeIcons: Record<PindouBeadShape, typeof Square> = {
    square: Square,
    circle: Circle,
  };

  return (
    <div className="flex items-center gap-0.5" aria-label={groupLabel} role="group">
      {(["square", "circle"] as const).map((shape) => {
        const Icon = shapeIcons[shape];
        return (
          <button
            key={shape}
            className={clsx(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition",
              selectedShape === shape ? theme.controlButtonActive : theme.pill,
            )}
            onClick={() => onChange(shape)}
            title={labels[shape]}
            type="button"
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}

function PindouBoardThemeButtons({
  isDark,
  selectedTheme,
  labels,
  groupLabel,
  onChange,
}: {
  isDark: boolean;
  selectedTheme: PindouBoardTheme;
  labels: Record<PindouBoardTheme, string>;
  groupLabel: string;
  onChange: (value: PindouBoardTheme) => void;
}) {
  const theme = getThemeClasses(isDark);

  return (
    <div className="flex items-center gap-1" aria-label={groupLabel} role="group">
      {pindouBoardThemes.map((boardTheme) => {
        const shades = getPindouBoardThemeShades(boardTheme);
        return (
          <button
            key={boardTheme}
            className={clsx(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border p-1 transition",
              selectedTheme === boardTheme ? theme.controlButtonActive : theme.pill,
            )}
            onClick={() => onChange(boardTheme)}
            title={labels[boardTheme]}
            type="button"
          >
            <span
              className="h-full w-full rounded-[4px] border border-black/10"
              style={boardTheme === "none"
                ? {
                    background: "#FFFFFF",
                    boxShadow: "inset 0 0 0 1px rgba(17,17,17,0.08)",
                  }
                : {
                    background: `linear-gradient(135deg, ${shades[0]} 0%, ${shades[0]} 33%, ${shades[1]} 33%, ${shades[1]} 66%, ${shades[2]} 66%, ${shades[2]} 100%)`,
                  }}
            />
          </button>
        );
      })}
    </div>
  );
}

function chunkPalette<T>(items: T[], size: number) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function BlinkingTimerText({
  value,
  colonVisible,
  className,
}: {
  value: string;
  colonVisible: boolean;
  className?: string;
}) {
  const [hoursText, minutesText = "00"] = value.split(":");

  return (
    <span className={clsx("inline-flex items-center justify-center leading-none tabular-nums", className)}>
      <span>{hoursText}</span>
      <span className={clsx("inline-block w-[0.5ch] text-center transition-opacity", colonVisible ? "opacity-100" : "opacity-0")}>:</span>
      <span>{minutesText}</span>
    </span>
  );
}

function BatteryStatusIcon({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  const level = getBatteryLevelBand(percent);
  const fillColor = level.color;
  const activeSegments = level.segments;

  return (
    <svg
      aria-label={`battery-${activeSegments}`}
      className={className}
      viewBox="0 0 28 14"
      fill="none"
      role="img"
    >
      <rect x="1" y="2" width="23" height="10" rx="2.2" stroke={fillColor} strokeWidth="1.2" />
      <rect x="24.8" y="5" width="2.2" height="4" rx="0.8" fill={fillColor} />
      {[0, 1, 2, 3, 4].map((index) => {
        const x = 3 + index * 4;
        return (
          <rect
            key={index}
            x={x}
            y="4"
            width="3"
            height="6"
            rx="0.8"
            fill={index < activeSegments ? fillColor : "transparent"}
            opacity={index < activeSegments ? 1 : 0.18}
            stroke={index < activeSegments ? "none" : fillColor}
            strokeWidth={index < activeSegments ? 0 : 0.6}
          />
        );
      })}
    </svg>
  );
}

function getBatteryLevelBand(percent: number) {
  if (percent >= 85) {
    return { segments: 5, color: "#2F9E44" };
  }
  if (percent >= 65) {
    return { segments: 4, color: "#2F9E44" };
  }
  if (percent >= 45) {
    return { segments: 3, color: "#D97706" };
  }
  if (percent >= 20) {
    return { segments: 2, color: "#D97706" };
  }
  return { segments: 1, color: "#DC2626" };
}

function formatPindouTimer(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatClockTime() {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function buildHoneycombLayout(
  options: Array<{ label: string; displayLabel: string; hex: string | null }>,
  popupWidth: number,
  popupHeight: number,
) {
  if (!options.length) {
    return {
      width: 120,
      height: 100,
      cells: [] as Array<{ sourceLabel: string; label: string; hex: string | null; points: string }>,
    };
  }

  const paddingX = 12;
  const paddingY = 12;
  const positions = buildHoneycombSpiralPositions(options.length);
  const bounds = getHoneycombBounds(positions);
  const availableWidth = Math.max(140, popupWidth - paddingX * 2);
  const availableHeight = Math.max(120, popupHeight - paddingY * 2);
  const widthUnits = Math.max(1, bounds.maxX - bounds.minX);
  const heightUnits = Math.max(1, bounds.maxY - bounds.minY);
  const radius = Math.max(2.8, Math.min(5.2, availableWidth / widthUnits, availableHeight / heightUnits));
  const width = Math.max(120, widthUnits * radius + paddingX * 2);
  const height = Math.max(100, heightUnits * radius + paddingY * 2);
  const centerOffsetX = paddingX + -bounds.minX * radius;
  const centerOffsetY = paddingY + -bounds.minY * radius;

  const cells = options.map((option, index) => {
    const position = positions[index];
    const [unitX, unitY] = axialToUnitPoint(position.q, position.r);
    const centerX = centerOffsetX + unitX * radius;
    const centerY = centerOffsetY + unitY * radius;
    return {
      sourceLabel: option.label,
      label: option.displayLabel,
      hex: option.hex,
      points: buildHexagonPoints(centerX, centerY, radius),
    };
  });

  return { width, height, cells };
}

function buildHexagonPoints(centerX: number, centerY: number, radius: number) {
  const points: string[] = [];
  for (let index = 0; index < 6; index += 1) {
    const angle = (-90 + index * 60) * (Math.PI / 180);
    points.push(`${(centerX + radius * Math.cos(angle)).toFixed(2)},${(centerY + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(" ");
}

function buildHoneycombSpiralPositions(count: number) {
  const positions: Array<{ q: number; r: number }> = [];
  if (count <= 0) {
    return positions;
  }

  positions.push({ q: 0, r: 0 });
  if (count === 1) {
    return positions;
  }

  let ring = 1;
  while (positions.length < count) {
    let q = ring;
    let r = 0;
    const directions: Array<[number, number]> = [[-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1]];
    for (const [dq, dr] of directions) {
      for (let step = 0; step < ring; step += 1) {
        if (positions.length >= count) {
          return positions;
        }
        positions.push({ q, r });
        q += dq;
        r += dr;
      }
    }
    ring += 1;
  }

  return positions;
}

function axialToUnitPoint(q: number, r: number) {
  return [Math.sqrt(3) * (q + r / 2), 1.5 * r] as const;
}

function getHoneycombBounds(positions: Array<{ q: number; r: number }>) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const position of positions) {
    const [x, y] = axialToUnitPoint(position.q, position.r);
    minX = Math.min(minX, x - Math.sqrt(3) / 2);
    maxX = Math.max(maxX, x + Math.sqrt(3) / 2);
    minY = Math.min(minY, y - 1);
    maxY = Math.max(maxY, y + 1);
  }

  return { minX, maxX, minY, maxY };
}
