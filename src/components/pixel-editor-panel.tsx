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
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { CanvasStage, clampEditorZoom, clampPindouZoom } from "./canvas-stage";
import { ChartSettingsTab } from "./chart-settings-tab";
import { SwitchRow } from "./controls";
import { shouldUseDesktopContentFitLayout } from "./pixel-editor-layout";
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
import { useLandscapeViewport } from "../lib/use-landscape-viewport";

export type EditorPanelMode = "edit" | "pindou" | "chart";
const EMPTY_SELECTION_LABEL = "__EMPTY__";

export function PixelEditorPanel({
  t,
  isDark,
  busy,
  stageBusy,
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
  processingElapsedMs,
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
  chartPreviewError,
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
  mobileApp = false,
}: {
  t: Messages;
  isDark: boolean;
  busy: boolean;
  stageBusy: boolean;
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
  processingElapsedMs: number;
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
  chartPreviewError: string | null;
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
  mobileApp?: boolean;
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
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === "undefined" ? 0 : window.innerWidth));
  const activeMatchedColorCount = matchedColors.filter(
    (color) => !disabledResultLabels.includes(color.label),
  ).length;
  const useDesktopContentFitLayout = shouldUseDesktopContentFitLayout({
    viewportWidth,
    focusOnly,
  });
  const processingElapsedNote = formatProcessingElapsedNote(processingElapsedMs);
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
      setViewportWidth((previous) => (previous === viewportWidth ? previous : viewportWidth));
      const panelRect = panelBodyRef.current.getBoundingClientRect();
      const parentRect = panelBodyRef.current.parentElement?.getBoundingClientRect() ?? null;
      const nextHeight = getPixelEditorPanelViewportHeight({
        viewportWidth,
        windowInnerHeight: window.innerHeight,
        panelTop: panelRect.top,
        parentBottom: parentRect?.bottom ?? null,
      });
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
        stageBusy={stageBusy}
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
        mobileApp={mobileApp}
        preferContentFit={useDesktopContentFitLayout}
        processingElapsedNote={processingElapsedNote}
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
          <EditModeWorkspace
            t={t}
            isDark={isDark}
            cells={cells}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            panelViewportHeight={panelViewportHeight}
            inputUrl={inputUrl}
            overlayCropRect={overlayCropRect}
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
            selectedHex={selectedHex}
            colorSystemId={colorSystemId}
            lockColorSystem={lockColorSystem}
            onColorSystemIdChange={onColorSystemIdChange}
            paletteOptions={paletteOptions}
            onSelectedLabelChange={onSelectedLabelChange}
            onApplyCell={onApplyCell}
            canvasCropSelection={canvasCropSelection}
            onCanvasCropSelectionChange={onCanvasCropSelectionChange}
            onCanvasCropConfirm={onCanvasCropConfirm}
            onCanvasCropCancel={onCanvasCropCancel}
            onUndo={onUndo}
            onRedo={onRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            paintActiveRef={paintActiveRef}
            matchedColors={matchedColors}
            disabledResultLabels={disabledResultLabels}
            matchedCoveragePercent={matchedCoveragePercent}
            onMatchedCoveragePercentChange={onMatchedCoveragePercentChange}
            onToggleMatchedColor={onToggleMatchedColor}
            onReplaceMatchedColor={onReplaceMatchedColor}
            stageBusy={stageBusy}
            preferContentFit={useDesktopContentFitLayout}
            processingElapsedNote={processingElapsedNote}
          />
        </Tabs.Content>

        <Tabs.Content value="pindou" className="flex min-h-0 w-full flex-1">
          <PindouModePanel
            t={t}
            isDark={isDark}
            busy={busy}
            stageBusy={stageBusy}
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
            preferContentFit={useDesktopContentFitLayout}
            processingElapsedNote={processingElapsedNote}
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
            chartPreviewError={chartPreviewError}
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

export function EditModeWorkspace({
  t,
  isDark,
  cells,
  gridWidth,
  gridHeight,
  panelViewportHeight = 0,
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
  matchedColors,
  disabledResultLabels,
  matchedCoveragePercent,
  onMatchedCoveragePercentChange,
  onToggleMatchedColor,
  onReplaceMatchedColor,
  stageBusy,
  preferContentFit = false,
  processingElapsedNote = null,
  mobileApp = false,
}: {
  t: Messages;
  isDark: boolean;
  cells: EditableCell[];
  gridWidth: number;
  gridHeight: number;
  panelViewportHeight?: number;
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
  matchedColors: Array<{ label: string; count: number; hex: string }>;
  disabledResultLabels: string[];
  matchedCoveragePercent: number;
  onMatchedCoveragePercentChange: (value: number) => void;
  onToggleMatchedColor: (label: string) => void;
  onReplaceMatchedColor: (sourceLabel: string, targetLabel: string) => void;
  stageBusy: boolean;
  preferContentFit?: boolean;
  processingElapsedNote?: string | null;
  mobileApp?: boolean;
}) {
  const theme = getThemeClasses(isDark);
  const editSectionRef = useRef<HTMLElement | null>(null);
  const editStageSurfaceRef = useRef<HTMLDivElement | null>(null);
  const isLandscapeViewport = useLandscapeViewport({
    enabled: mobileApp,
    includeOrientationChange: true,
  });
  const [sideMountedEditToolRailHeight, setSideMountedEditToolRailHeight] = useState(0);
  const [mobileVisiblePanelHeight, setMobileVisiblePanelHeight] = useState(0);

  useEffect(() => {
    if (!mobileApp) {
      return;
    }

    function syncMobileVisiblePanelHeight() {
      if (!editSectionRef.current) {
        return;
      }

      const panelRect = editSectionRef.current.getBoundingClientRect();
      const navTop = document.querySelector("nav")?.getBoundingClientRect().top ?? window.innerHeight - 68;
      const nextHeight = getPindouVisiblePanelHeight({
        panelTop: panelRect.top,
        navTop,
        viewportHeight: window.innerHeight,
      });
      setMobileVisiblePanelHeight((current) => (current === nextHeight ? current : nextHeight));
    }

    syncMobileVisiblePanelHeight();
    window.addEventListener("resize", syncMobileVisiblePanelHeight);
    window.addEventListener("orientationchange", syncMobileVisiblePanelHeight);
    return () => {
      window.removeEventListener("resize", syncMobileVisiblePanelHeight);
      window.removeEventListener("orientationchange", syncMobileVisiblePanelHeight);
    };
  }, [mobileApp]);

  const mobileStageRegion = getMobileWorkspaceStageRegionMode({
    panel: "edit",
    mobileApp,
  });
  const mobileChrome = getMobileWorkspaceChromeMode({
    panel: "edit",
    mobileApp,
    isLandscapeViewport,
  });
  const useSideMountedEditToolRail = shouldUseSideMountedEditToolRail({
    mobileApp,
    isLandscapeViewport,
    mergeEditToolRailIntoToolbar: mobileChrome.mergeEditToolRailIntoToolbar,
  });
  const effectiveEditPanelViewportHeight = getEffectiveMobileEditPanelHeight({
    panelViewportHeight,
    mobileVisiblePanelHeight,
  });
  const sideMountedEditToolRailLayout = getAdaptiveEditToolRailLayout({
    availableHeight: getMobileLandscapeEditToolRailAvailableHeight({
      measuredHeight: sideMountedEditToolRailHeight,
      mobileApp,
      isLandscapeViewport,
      useSideMountedEditToolRail,
    }),
    itemCount: 10,
  });
  const mobileEditStageHeight =
    mobileStageRegion.fixedViewport && !useSideMountedEditToolRail
      ? getMobileEditStageHeight({
          panelViewportHeight: effectiveEditPanelViewportHeight,
        })
      : 0;

  useEffect(() => {
    if (!useSideMountedEditToolRail) {
      return;
    }

    const element = editStageSurfaceRef.current;
    if (!element) {
      return;
    }
    const target = element;

    function syncRailHeight() {
      const nextHeight = Math.floor(target.getBoundingClientRect().height);
      if (nextHeight > 0) {
        setSideMountedEditToolRailHeight((current) => (current === nextHeight ? current : nextHeight));
      }
    }

    syncRailHeight();
    const observer = new ResizeObserver(syncRailHeight);
    observer.observe(target);
    window.addEventListener("resize", syncRailHeight);
    window.addEventListener("orientationchange", syncRailHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncRailHeight);
      window.removeEventListener("orientationchange", syncRailHeight);
    };
  }, [useSideMountedEditToolRail]);
  const activeMatchedColorCount = matchedColors.filter(
    (color) => !disabledResultLabels.includes(color.label),
  ).length;
  const tools: Array<{
    id: EditTool;
    label: string;
    icon: typeof Pencil;
  }> = [
    { id: "pan", label: t.toolPan ?? "Pan", icon: Hand },
    { id: "zoom", label: t.toolZoom ?? "Zoom", icon: Search },
    { id: "crop", label: t.toolCrop, icon: Crop },
    { id: "paint", label: t.toolPaint, icon: Pencil },
    { id: "erase", label: t.toolErase, icon: Eraser },
    { id: "pick", label: t.toolPick, icon: Pipette },
    { id: "fill", label: t.toolFill, icon: PaintBucket },
  ];
  const sideMountedEditToolRailButtons = [
    ...tools.map((tool) => (
      <ToolIconButton
        key={tool.id}
        active={editTool === tool.id}
        icon={tool.icon}
        isDark={isDark}
        label={tool.label}
        onClick={() => onEditToolChange(tool.id)}
      />
    )),
    <ToolIconButton
      key="undo"
      active={false}
      disabled={!canUndo}
      icon={Undo2}
      isDark={isDark}
      label={t.toolUndo}
      onClick={onUndo}
    />,
    <ToolIconButton
      key="redo"
      active={false}
      disabled={!canRedo}
      icon={Redo2}
      isDark={isDark}
      label={t.toolRedo}
      onClick={onRedo}
    />,
    <ToolIconButton
      key="overlay"
      active={overlayEnabled}
      icon={overlayEnabled ? Eye : EyeOff}
      isDark={isDark}
      label={t.overlayToggle}
      onClick={() => onOverlayEnabledChange(!overlayEnabled)}
    />,
  ];
  const editToolRail = (
    <section
      className={getEditToolRailSectionClassName({
        mobileApp,
        useSideMountedEditToolRail,
        mergeEditToolRailIntoToolbar: mobileChrome.mergeEditToolRailIntoToolbar,
        isDark,
      })}
    >
      {useSideMountedEditToolRail ? (
        <div
          className="grid content-start justify-center gap-1.5 overflow-hidden"
          style={{
            gridAutoFlow: "column",
            gridTemplateRows: `repeat(${sideMountedEditToolRailLayout.rows}, 40px)`,
            gridAutoColumns: "40px",
          }}
        >
          {sideMountedEditToolRailButtons}
        </div>
      ) : (
        <div
          className={clsx(
            "flex w-full flex-wrap gap-2 overflow-visible",
            mobileChrome.mergeEditToolRailIntoToolbar ? "items-start" : "lg:flex-col lg:flex-nowrap",
          )}
        >
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
          {!mobileChrome.mergeEditToolRailIntoToolbar ? (
            <div className={clsx("hidden h-px lg:block", theme.divider)} />
          ) : null}
          <div className={clsx("flex flex-wrap gap-2", mobileChrome.mergeEditToolRailIntoToolbar ? "" : "lg:contents")}>
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
            {!mobileChrome.mergeEditToolRailIntoToolbar ? (
              <div className={clsx("hidden h-px lg:block", theme.divider)} />
            ) : null}
            <ToolIconButton
              active={overlayEnabled}
              icon={overlayEnabled ? Eye : EyeOff}
              isDark={isDark}
              label={t.overlayToggle}
              onClick={() => onOverlayEnabledChange(!overlayEnabled)}
            />
          </div>
        </div>
      )}
    </section>
  );
  const editToolbarSummaryRow = (
    <div
      data-edit-toolbar-row="true"
      className={clsx(
        mobileChrome.useSharedToolbarSurface
          ? "relative z-20 flex min-w-0 flex-wrap items-start gap-2 px-2 py-3"
          : mobileApp
            ? "relative z-20 flex min-w-0 shrink-0 flex-wrap items-start gap-2 border-b px-0 py-1.5 sm:flex-nowrap"
            : "relative z-20 flex min-w-0 shrink-0 flex-wrap items-start gap-2 px-2 py-2 sm:flex-nowrap sm:px-2 sm:py-2 lg:px-1.5",
        mobileChrome.useSharedToolbarSurface ? "" : mobileApp ? (isDark ? "border-white/10" : "border-stone-200") : theme.subtlePanel,
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
  );
  const editStageSurface = (
    <div
      ref={editStageSurfaceRef}
      className={clsx(
        "relative z-0 flex min-h-0 min-w-0 flex-1 overflow-hidden flex-col",
        mobileChrome.mergeEditToolRailIntoToolbar
          ? ""
          : useSideMountedEditToolRail
            ? "grid"
            : "lg:grid lg:grid-cols-[60px_minmax(0,1fr)]",
      )}
      style={getEditStageSurfaceInlineStyle({
        useSideMountedEditToolRail,
        railWidthPx: sideMountedEditToolRailLayout.railWidthPx,
      })}
    >
      {!mobileChrome.mergeEditToolRailIntoToolbar ? editToolRail : null}
      <div
        className={getEditStageViewportContainerClassName({
          useSharedStageInset: mobileChrome.useSharedStageInset,
          fixedViewport: mobileStageRegion.fixedViewport,
          useSideMountedEditToolRail,
        })}
        style={
          mobileStageRegion.fixedViewport && !useSideMountedEditToolRail && mobileEditStageHeight > 0
            ? { height: `${mobileEditStageHeight}px` }
            : undefined
        }
      >
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
          busy={stageBusy}
          embeddedInPanel
          preferContentFit={preferContentFit}
          footerNote={processingElapsedNote}
        />
      </div>
    </div>
  );
  const editSectionInlineStyle = getEditPanelSectionInlineStyle({
    mobileApp,
    useSideMountedEditToolRail,
    panelViewportHeight: effectiveEditPanelViewportHeight,
  });

  return (
    <section
      ref={editSectionRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      style={editSectionInlineStyle}
    >
      {mobileChrome.useUnifiedStageShell ? (
        <div
          className={clsx(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border",
            getUnifiedWorkspaceShellCorners(),
            theme.subtlePanel,
            isDark ? "border-white/12" : "border-stone-300",
          )}
        >
          {editToolbarSummaryRow}
          <div className={clsx("h-px w-full", theme.divider)} />
          {shouldRenderStandaloneEditToolRailRow(mobileChrome) ? editToolRail : null}
          {shouldRenderStandaloneEditToolRailRow(mobileChrome) ? <div className={clsx("h-px w-full", theme.divider)} /> : null}
          {editStageSurface}
        </div>
      ) : mobileChrome.useSharedToolbarSurface ? (
        <div className={clsx("shrink-0", theme.subtlePanel)}>
          {editToolbarSummaryRow}
          <div className={clsx("h-px w-full", theme.divider)} />
          {editToolRail}
        </div>
      ) : (
        <>
          {editToolbarSummaryRow}
          {!mobileApp ? <div className={clsx("relative z-20 h-px w-full shrink-0", theme.divider)} /> : null}
        </>
      )}

      {!mobileChrome.useUnifiedStageShell ? editStageSurface : null}
    </section>
  );
}

export function PindouModePanel({
  t,
  isDark,
  busy,
  stageBusy,
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
  preferContentFit = false,
  processingElapsedNote = null,
  mobileApp = false,
}: {
  t: Messages;
  isDark: boolean;
  busy: boolean;
  stageBusy: boolean;
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
  preferContentFit?: boolean;
  processingElapsedNote?: string | null;
  mobileApp?: boolean;
}) {
  const theme = getThemeClasses(isDark);
  const panelSectionRef = useRef<HTMLElement | null>(null);
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
  const isLandscapeViewport = useLandscapeViewport({ enabled: focusOnly });
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === "undefined" ? 0 : window.innerWidth));
  const [focusToolbarMenuOpen, setFocusToolbarMenuOpen] = useState(false);
  const [currentClock, setCurrentClock] = useState(() => formatClockTime());
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [mobileVisiblePanelHeight, setMobileVisiblePanelHeight] = useState(0);
  const [timerColonVisible, setTimerColonVisible] = useState(() => new Date().getSeconds() % 2 === 0);
  const [portraitFocusZoomBarVisible, setPortraitFocusZoomBarVisible] = useState(true);
  const showPinnedTimerSummary = pindouTimerRunning || pindouTimerElapsedMs > 0;
  const isMobileUserAgent = useMemo(() => {
    if (typeof navigator === "undefined") {
      return false;
    }

    return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent ?? "");
  }, []);
  const useCompactLandscapeFocusToolbar = focusOnly && isLandscapeViewport && viewportWidth <= 1180 && !mobileApp;
  const usePortraitMobileFocusZoomBar = focusOnly && isMobileUserAgent && !isLandscapeViewport;
  const reserveFocusToolbarSpace = focusOnly && mobileApp && isLandscapeViewport;
  const portraitFocusZoomHideTimerRef = useRef<number | null>(null);
  const lastPortraitFocusZoomRef = useRef(pindouZoom);

  useEffect(() => {
    if (!focusOnly) {
      return;
    }

    function syncViewportWidth() {
      setViewportWidth(window.innerWidth);
    }

    syncViewportWidth();
    window.addEventListener("resize", syncViewportWidth);
    return () => {
      window.removeEventListener("resize", syncViewportWidth);
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

  const useLandscapeColorRail = shouldUsePindouLandscapeColorRail({
    mobileApp,
    isLandscapeViewport,
  });
  const mobileStageRegion = getMobileWorkspaceStageRegionMode({
    panel: "pindou",
    mobileApp,
  });
  const useMobileSquareStage =
    mobileStageRegion.squareViewport && !focusOnly && !useLandscapeColorRail;
  const colorRailMode = getPindouColorRailMode({
    mobileApp,
    focusOnly,
    useLandscapeColorRail,
    useMobileSquareStage,
  });
  const focusColorRailWidth = 220;
  const colorRailHint = t.pindouModeHint;
  const showExpandedFocusToolbar = focusOnly && !useCompactLandscapeFocusToolbar;
  const landscapeRailContentMode = getPindouLandscapeRailContentMode({
    useLandscapeColorRail,
    focusOnly,
    useCompactLandscapeFocusToolbar,
  });
  const effectivePanelViewportHeight =
    panelViewportHeight > 0 ? panelViewportHeight : mobileVisiblePanelHeight;
  const panelSectionInlineStyle = getPindouPanelSectionInlineStyle({
    mobileApp,
    focusOnly,
    useLandscapeColorRail,
    panelViewportHeight: effectivePanelViewportHeight,
  });
  const useAdaptiveMobileStageHeight = mobileApp && !focusOnly && !useLandscapeColorRail;
  const mobilePindouStageHeight = useAdaptiveMobileStageHeight
    ? getMobilePindouStageHeight({
        panelViewportHeight: effectivePanelViewportHeight,
        reserveColorRailRows: 2,
        includeHint: colorRailMode.hintPlacement === "above",
      })
    : 0;
  useEffect(() => {
    if (focusOnly || !mobileApp) {
      return;
    }

    function syncMobileVisiblePanelHeight() {
      if (!panelSectionRef.current) {
        return;
      }

      const panelRect = panelSectionRef.current.getBoundingClientRect();
      const navTop = document.querySelector("nav")?.getBoundingClientRect().top ?? window.innerHeight - 68;
      const nextHeight = getPindouVisiblePanelHeight({
        panelTop: panelRect.top,
        navTop,
        viewportHeight: window.innerHeight,
      });
      setMobileVisiblePanelHeight((previous) => (previous === nextHeight ? previous : nextHeight));
    }

    syncMobileVisiblePanelHeight();
    window.addEventListener("resize", syncMobileVisiblePanelHeight);
    window.addEventListener("orientationchange", syncMobileVisiblePanelHeight);
    return () => {
      window.removeEventListener("resize", syncMobileVisiblePanelHeight);
      window.removeEventListener("orientationchange", syncMobileVisiblePanelHeight);
    };
  }, [focusOnly, mobileApp]);
  const pindouCanvasStageProps = {
    cells,
    gridWidth,
    gridHeight,
    emptyPixelLabel: t.emptyPixel,
    inputUrl: null,
    overlayCropRect: null,
    overlayEnabled: false,
    isDark,
    stageMode: "pindou" as const,
    focusedLabel: focusedSketchLabel,
    onFocusLabelChange: onFocusedSketchLabelChange,
    paintActiveRef,
    focusOnly,
    flipHorizontal: pindouFlipHorizontal,
    showPindouLabels: pindouShowLabels,
    pindouBeadShape,
    pindouBoardTheme,
    pindouZoom,
    onPindouZoomChange,
    busy: stageBusy,
    embeddedInPanel: !focusOnly,
    preferContentFit,
    footerNote: processingElapsedNote,
    onPindouStageTap: useCompactLandscapeFocusToolbar ? () => setFocusToolbarMenuOpen(false) : undefined,
  };
  const pindouStageArea = (
    <div
      className={getPindouStageAreaClassName({
        focusOnly,
        reserveFocusToolbarSpace,
      })}
    >
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
              {landscapeRailContentMode === "focus-toolbar" ? (
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
                        <PindouTimerControl
                          compact
                          theme={theme}
                          timerDisplay={timerDisplay}
                          timerColonVisible={timerColonVisible}
                          pindouTimerRunning={pindouTimerRunning}
                          timerPauseLabel={timerPauseLabel}
                          timerStartLabel={timerStartLabel}
                          timerResetLabel={timerResetLabel}
                          onPindouTimerToggle={onPindouTimerToggle}
                          onPindouTimerReset={onPindouTimerReset}
                        />
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
                    </div>
                  ) : null}
                </div>
              ) : null}
              {landscapeRailContentMode === "swatches" ? (
                <PindouLandscapeSwatchRail
                  colors={pindouColors}
                  focusedLabel={focusedSketchLabel}
                  onFocusLabelChange={onFocusedSketchLabelChange}
                  colorRailHint={colorRailHint}
                  theme={theme}
                />
              ) : null}
            </div>
          </aside>

          <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
            <CanvasStage
              {...pindouCanvasStageProps}
              viewportClassName={useLandscapeColorRail ? "rounded-l-none" : undefined}
            />
          </div>
        </div>
      ) : (
        <div
          className={clsx(
            "relative min-w-0 overflow-hidden",
            useAdaptiveMobileStageHeight
              ? "flex h-full min-h-0 w-full flex-1"
              : useMobileSquareStage
                ? "aspect-square w-full shrink-0"
                : "flex h-full min-h-0 flex-1",
          )}
          style={useAdaptiveMobileStageHeight && mobilePindouStageHeight > 0 ? { height: `${mobilePindouStageHeight}px` } : undefined}
        >
          <CanvasStage
            {...pindouCanvasStageProps}
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
  );

  return (
    <section
      ref={panelSectionRef}
      className={getPindouPanelSectionClassName({ focusOnly, useLandscapeColorRail })}
      style={panelSectionInlineStyle}
    >
      {showExpandedFocusToolbar ? (
        <div className="pointer-events-none absolute left-3 right-3 top-0 z-30 flex flex-wrap justify-center gap-2">
          {isMobileUserAgent ? (
            <PindouClockBadge
              batteryPercent={batteryPercent}
              className="pointer-events-auto shadow-sm backdrop-blur"
              currentClock={currentClock}
              theme={theme}
            />
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
          <PindouTimerControl
            theme={theme}
            timerDisplay={timerDisplay}
            timerColonVisible={timerColonVisible}
            pindouTimerRunning={pindouTimerRunning}
            timerPauseLabel={timerPauseLabel}
            timerStartLabel={timerStartLabel}
            timerResetLabel={timerResetLabel}
            onPindouTimerToggle={onPindouTimerToggle}
            onPindouTimerReset={onPindouTimerReset}
            className="pointer-events-auto shadow-sm backdrop-blur"
          />
          {!usePortraitMobileFocusZoomBar ? (
            <PindouZoomControl
              theme={theme}
              pindouZoom={pindouZoom}
              onPindouZoomChange={onPindouZoomChange}
              shellClassName="pointer-events-auto shadow-sm backdrop-blur"
            />
          ) : null}
          <PindouIconToggleButton
            active={pindouFlipHorizontal}
            className="pointer-events-auto shadow-sm backdrop-blur"
            onToggle={() => onPindouFlipHorizontalChange(!pindouFlipHorizontal)}
            theme={theme}
            title={flipHorizontalLabel}
          >
            <FlipHorizontal className="h-4 w-4" />
          </PindouIconToggleButton>
          <PindouIconToggleButton
            active={pindouShowLabels}
            className="pointer-events-auto shadow-sm backdrop-blur"
            onToggle={() => onPindouShowLabelsChange(!pindouShowLabels)}
            theme={theme}
            title={showLabelsLabel}
          >
            <TypeIcon className="h-4 w-4" />
          </PindouIconToggleButton>
          <PindouChoiceGroupShell
            className="pointer-events-auto shadow-sm backdrop-blur"
            theme={theme}
          >
            <PindouBeadShapeButtons
              isDark={isDark}
              selectedShape={pindouBeadShape}
              labels={beadShapeLabels}
              groupLabel={beadShapeLabel}
              onChange={onPindouBeadShapeChange}
            />
          </PindouChoiceGroupShell>
          <PindouChoiceGroupShell
            className="pointer-events-auto shadow-sm backdrop-blur"
            theme={theme}
          >
            <PindouBoardThemeButtons
              isDark={isDark}
              selectedTheme={pindouBoardTheme}
              labels={boardThemeLabels}
              groupLabel={boardThemeLabel}
              onChange={onPindouBoardThemeChange}
            />
          </PindouChoiceGroupShell>
          <button
            className={clsx(
              getPindouFocusButtonClassName({
                mobileApp,
                focusOnly: true,
              }),
              theme.pill,
            )}
            onClick={() => onFocusViewOpenChange(false)}
            title={t.pindouExitFocus}
            type="button"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      {!focusOnly ? (
        <div
          className={clsx(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border",
            getUnifiedWorkspaceShellCorners(),
            theme.subtlePanel,
            isDark ? "border-white/12" : "border-stone-300",
          )}
        >
          <div
            className={clsx(
              "flex min-w-0 flex-wrap items-center gap-2 px-2 py-3 sm:px-2 sm:py-4 lg:px-1.5",
            )}
          >
            <PindouTimerControl
              theme={theme}
              timerDisplay={timerDisplay}
              timerColonVisible={timerColonVisible}
              pindouTimerRunning={pindouTimerRunning}
              timerPauseLabel={timerPauseLabel}
              timerStartLabel={timerStartLabel}
              timerResetLabel={timerResetLabel}
              onPindouTimerToggle={onPindouTimerToggle}
              onPindouTimerReset={onPindouTimerReset}
              className="shrink-0"
            />
            <PindouZoomControl
              theme={theme}
              pindouZoom={pindouZoom}
              onPindouZoomChange={onPindouZoomChange}
              shellClassName="shrink-0"
            />
            <PindouIconToggleButton
              active={pindouFlipHorizontal}
              onToggle={() => onPindouFlipHorizontalChange(!pindouFlipHorizontal)}
              theme={theme}
              title={flipHorizontalLabel}
            >
              <FlipHorizontal className="h-4 w-4" />
            </PindouIconToggleButton>
            <PindouIconToggleButton
              active={pindouShowLabels}
              onToggle={() => onPindouShowLabelsChange(!pindouShowLabels)}
              theme={theme}
              title={showLabelsLabel}
            >
              <TypeIcon className="h-4 w-4" />
            </PindouIconToggleButton>
            <PindouChoiceGroupShell className="shrink-0" theme={theme}>
              <PindouBeadShapeButtons
                isDark={isDark}
                selectedShape={pindouBeadShape}
                labels={beadShapeLabels}
                groupLabel={beadShapeLabel}
                onChange={onPindouBeadShapeChange}
              />
            </PindouChoiceGroupShell>
            <PindouChoiceGroupShell className="shrink-0" theme={theme}>
              <PindouBoardThemeButtons
                isDark={isDark}
                selectedTheme={pindouBoardTheme}
                labels={boardThemeLabels}
                groupLabel={boardThemeLabel}
                onChange={onPindouBoardThemeChange}
              />
            </PindouChoiceGroupShell>
            <button
              className={clsx(
                getPindouFocusButtonClassName({
                  mobileApp,
                  focusOnly: false,
                }),
                theme.pill,
              )}
              onClick={() => onFocusViewOpenChange(!focusViewOpen)}
              title={t.pindouFocusView}
              type="button"
            >
              <Maximize2 className="h-4 w-4" />
              {!mobileApp ? (
                <span className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.pindouFocusView}</span>
              ) : null}
            </button>
          </div>
          <div className={clsx("h-px w-full shrink-0", theme.divider)} />
          {pindouStageArea}
        </div>
      ) : pindouStageArea}

      {!useLandscapeColorRail && colorRailMode.hintPlacement === "above" ? (
        <p
          className={clsx(getPindouColorRailHintClassName(colorRailMode), theme.cardMuted)}
        >
          {colorRailHint}
        </p>
      ) : null}
      {!useLandscapeColorRail ? (
        <PindouBottomColorRail
          colors={pindouColors}
          focusedLabel={focusedSketchLabel}
          onFocusLabelChange={onFocusedSketchLabelChange}
          colorRailMode={colorRailMode}
          mobileApp={mobileApp}
          focusOnly={focusOnly}
          theme={theme}
        />
      ) : null}
      {!useLandscapeColorRail && !focusOnly ? (
        colorRailMode.hintPlacement === "below" ? (
          <p className={clsx(colorRailMode.pageBottomSection ? "pb-4 text-xs" : "mt-3 text-xs", theme.cardMuted)}>
            {t.pindouModeHint}
          </p>
        ) : null
      ) : null}
    </section>
  );
}

export function formatProcessingElapsedNote(elapsedMs: number) {
  if (elapsedMs <= 0) {
    return null;
  }

  return formatProcessingElapsed(elapsedMs);
}

type PindouStageColor = ReturnType<typeof summarizeStageColors>[number];

function PindouColorSwatchButton({
  color,
  active,
  theme,
  className,
  onToggle,
}: {
  color: PindouStageColor;
  active: boolean;
  theme: ReturnType<typeof getThemeClasses>;
  className: string;
  onToggle: () => void;
}) {
  return (
    <button
      className={className}
      onClick={onToggle}
      title={color.label}
      type="button"
    >
      <span
        className="h-4 w-4 shrink-0 rounded-full border border-black/10"
        style={{ backgroundColor: color.hex }}
      />
      <span className={clsx("min-w-0 truncate text-sm font-semibold", active ? "" : theme.cardTitle)}>
        {color.label}
      </span>
      <span className={clsx("ml-auto shrink-0 text-[11px]", active ? "" : theme.cardMuted)}>
        {color.count}
      </span>
    </button>
  );
}

function PindouLandscapeSwatchRail({
  colors,
  focusedLabel,
  onFocusLabelChange,
  colorRailHint,
  theme,
}: {
  colors: PindouStageColor[];
  focusedLabel: string | null;
  onFocusLabelChange: (label: string | null) => void;
  colorRailHint: string;
  theme: ReturnType<typeof getThemeClasses>;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className={clsx("px-1 text-xs", theme.cardMuted)}>{colorRailHint}</p>
      <div className="min-h-0 flex-1 overflow-auto pr-1">
        <div className={getPindouLandscapeSwatchGridClassName()}>
          {colors.map((color) => {
            const active = focusedLabel === color.label;
            return (
              <PindouColorSwatchButton
                key={color.label}
                active={active}
                color={color}
                theme={theme}
                className={clsx(
                  "flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left transition-colors",
                  active ? theme.controlButtonActive : theme.pill,
                )}
                onToggle={() => onFocusLabelChange(active ? null : color.label)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PindouBottomColorRail({
  colors,
  focusedLabel,
  onFocusLabelChange,
  colorRailMode,
  mobileApp,
  focusOnly,
  theme,
}: {
  colors: PindouStageColor[];
  focusedLabel: string | null;
  onFocusLabelChange: (label: string | null) => void;
  colorRailMode: ReturnType<typeof getPindouColorRailMode>;
  mobileApp: boolean;
  focusOnly: boolean;
  theme: ReturnType<typeof getThemeClasses>;
}) {
  const renderSlotCount = getPindouColorRailRenderSlotCount({
    itemCount: colors.length,
    columns: colorRailMode.columns,
    equalWidthGrid: colorRailMode.equalWidthGrid,
  });
  const roundOuterCorners = shouldRoundPindouColorRailOuterCorners({
    mobileApp,
    focusOnly,
    equalWidthGrid: colorRailMode.equalWidthGrid,
  });

  return (
    <div
      className={clsx(
        "w-full min-w-0 self-stretch",
        focusOnly ? "mt-2" : colorRailMode.hintPlacement === "above" ? "mt-1" : "mt-4",
        colorRailMode.equalWidthGrid
          ? clsx(
              "grid grid-cols-4 gap-0",
              colorRailMode.gridOverflowMode === "page-flow"
                ? "pb-4"
                : clsx(colorRailMode.maxHeightClass, "overflow-y-auto overscroll-contain"),
            )
          : clsx(
              "flex gap-2",
              colorRailMode.gridOverflowMode === "page-flow"
                ? "flex-wrap pb-4"
                : colorRailMode.horizontalStrip
                  ? "flex-nowrap overflow-x-auto overflow-y-hidden pb-1 pr-1"
                  : clsx(colorRailMode.maxHeightClass, "overflow-auto flex-wrap overscroll-contain"),
            ),
      )}
      style={getMobilePindouColorRailViewportBleedStyle(colorRailMode.fullBleed)}
    >
      {Array.from({ length: renderSlotCount }).map((_, index) => {
        const color = colors[index];
        const colorRailCorners = getPindouColorRailItemCornerFlags({
          index,
          total: renderSlotCount,
          columns: colorRailMode.columns,
        });
        if (!color) {
          return (
            <div
              aria-hidden="true"
              key={`dummy-${index}`}
              className={getPindouColorRailDummySlotClassName({
                equalWidthGrid: colorRailMode.equalWidthGrid,
                roundOuterCorners,
                topLeft: colorRailCorners.topLeft,
                topRight: colorRailCorners.topRight,
                bottomLeft: colorRailCorners.bottomLeft,
                bottomRight: colorRailCorners.bottomRight,
              })}
            />
          );
        }
        const active = focusedLabel === color.label;
        return (
          <PindouColorSwatchButton
            key={color.label}
            active={active}
            color={color}
            theme={theme}
            className={clsx(
              "flex items-center gap-2 rounded-md border px-2 py-2 transition-colors",
              colorRailMode.horizontalStrip && "shrink-0",
              colorRailMode.equalWidthGrid && "min-h-11 w-full min-w-0 justify-start rounded-none",
              roundOuterCorners && colorRailMode.equalWidthGrid && colorRailCorners.topLeft && "rounded-tl-[10px]",
              roundOuterCorners && colorRailMode.equalWidthGrid && colorRailCorners.topRight && "rounded-tr-[10px]",
              roundOuterCorners && colorRailMode.equalWidthGrid && colorRailCorners.bottomLeft && "rounded-bl-[10px]",
              roundOuterCorners && colorRailMode.equalWidthGrid && colorRailCorners.bottomRight && "rounded-br-[10px]",
              active ? theme.controlButtonActive : theme.pill,
            )}
            onToggle={() => onFocusLabelChange(active ? null : color.label)}
          />
        );
      })}
    </div>
  );
}

function PindouIconToggleButton({
  theme,
  active = false,
  title,
  onToggle,
  className,
  children,
}: {
  theme: ReturnType<typeof getThemeClasses>;
  active?: boolean;
  title: string;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      className={clsx(
        "flex h-10 w-10 items-center justify-center rounded-md border transition",
        active ? theme.controlButtonActive : theme.pill,
        className,
      )}
      onClick={onToggle}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function PindouChoiceGroupShell({
  theme,
  className,
  children,
}: {
  theme: ReturnType<typeof getThemeClasses>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={clsx("flex h-10 items-center gap-1 rounded-md border px-1 py-0.5", theme.pill, className)}>
      {children}
    </div>
  );
}

function PindouZoomControl({
  theme,
  pindouZoom,
  onPindouZoomChange,
  shellClassName,
}: {
  theme: ReturnType<typeof getThemeClasses>;
  pindouZoom: number;
  onPindouZoomChange: (value: number) => void;
  shellClassName?: string;
}) {
  return (
    <div className={clsx("flex h-10 items-center rounded-md border p-0.5", theme.pill, shellClassName)}>
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
  );
}

function PindouClockBadge({
  theme,
  currentClock,
  batteryPercent,
  className,
}: {
  theme: ReturnType<typeof getThemeClasses>;
  currentClock: string;
  batteryPercent: number | null;
  className?: string;
}) {
  return (
    <div className={clsx("flex h-10 items-center gap-2 rounded-md border px-2 py-0.5", theme.pill, className)}>
      {batteryPercent !== null ? <BatteryStatusIcon className="h-4 w-8" percent={batteryPercent} /> : null}
      <span className={clsx("whitespace-nowrap text-sm font-semibold tabular-nums", theme.cardTitle)}>
        {currentClock}
      </span>
    </div>
  );
}

function PindouTimerControl({
  theme,
  timerDisplay,
  timerColonVisible,
  pindouTimerRunning,
  timerPauseLabel,
  timerStartLabel,
  timerResetLabel,
  onPindouTimerToggle,
  onPindouTimerReset,
  compact = false,
  className,
}: {
  theme: ReturnType<typeof getThemeClasses>;
  timerDisplay: string;
  timerColonVisible: boolean;
  pindouTimerRunning: boolean;
  timerPauseLabel: string;
  timerStartLabel: string;
  timerResetLabel: string;
  onPindouTimerToggle: () => void;
  onPindouTimerReset: () => void;
  compact?: boolean;
  className?: string;
}) {
  const shellClassName = compact
    ? "flex h-9 items-center gap-1 rounded-md border px-1 py-0.5"
    : "flex h-10 items-center gap-1 rounded-md border pl-1 pr-0.5 py-0.5";
  const textClassName = compact
    ? clsx("min-w-[52px] px-1.5 text-center text-xs font-semibold leading-none", theme.cardTitle)
    : clsx("min-w-[56px] px-2 text-center text-xs font-semibold", theme.cardTitle);
  const iconClassName = compact ? "h-3.5 w-3.5" : "h-4 w-4";
  const buttonSizeClassName = compact ? "h-7 w-7" : "h-8 w-8";

  return (
    <div className={clsx(shellClassName, theme.pill, className)}>
      <button
        className={clsx("flex min-w-0 flex-1 items-center justify-center", compact ? "h-7" : "")}
        onClick={onPindouTimerToggle}
        title={pindouTimerRunning ? timerPauseLabel : timerStartLabel}
        type="button"
      >
        <BlinkingTimerText
          className={textClassName}
          value={timerDisplay}
          colonVisible={timerColonVisible}
        />
      </button>
      <button
        className={clsx("flex items-center justify-center rounded-md transition", buttonSizeClassName, theme.pill)}
        onClick={onPindouTimerToggle}
        title={pindouTimerRunning ? timerPauseLabel : timerStartLabel}
        type="button"
      >
        {pindouTimerRunning ? <Pause className={iconClassName} /> : <Play className={iconClassName} />}
      </button>
      <button
        className={clsx("flex items-center justify-center rounded-md transition", buttonSizeClassName, theme.pill)}
        onClick={onPindouTimerReset}
        title={timerResetLabel}
        type="button"
      >
        <RotateCcw className={iconClassName} />
      </button>
    </div>
  );
}

export function getPindouColorRailMode({
  mobileApp,
  focusOnly,
  useLandscapeColorRail,
  useMobileSquareStage,
}: {
  mobileApp: boolean;
  focusOnly: boolean;
  useLandscapeColorRail: boolean;
  useMobileSquareStage: boolean;
}) {
  const pageBottomSection = mobileApp && !useLandscapeColorRail;
  const equalWidthGrid = mobileApp && !useLandscapeColorRail;
  const fullBleed = focusOnly && equalWidthGrid;
  const useClampedFullscreenMobileRail = mobileApp && focusOnly && !useLandscapeColorRail;
  return {
    pageBottomSection,
    horizontalStrip: !equalWidthGrid && !pageBottomSection && useMobileSquareStage,
    equalWidthGrid,
    gaplessGrid: equalWidthGrid,
    columns: equalWidthGrid ? 4 : 0,
    fullBleed,
    gridOverflowMode: useClampedFullscreenMobileRail ? ("clamped" as const) : pageBottomSection ? ("page-flow" as const) : ("clamped" as const),
    maxHeightClass: useClampedFullscreenMobileRail ? "max-h-[132px]" : "max-h-[220px]",
    hintPlacement: mobileApp ? (focusOnly ? "hidden" : "above") : "below",
    hintCentered: mobileApp && !focusOnly,
  };
}

export function getPindouLandscapeRailContentMode({
  useLandscapeColorRail,
  focusOnly,
  useCompactLandscapeFocusToolbar,
}: {
  useLandscapeColorRail: boolean;
  focusOnly: boolean;
  useCompactLandscapeFocusToolbar: boolean;
}) {
  if (!useLandscapeColorRail) {
    return "none" as const;
  }
  if (focusOnly && useCompactLandscapeFocusToolbar) {
    return "focus-toolbar" as const;
  }
  return "swatches" as const;
}

export function getPindouLandscapeSwatchGridClassName() {
  return "grid grid-cols-2 gap-2";
}

export function getPindouPanelSectionClassName({
  focusOnly,
  useLandscapeColorRail = false,
}: {
  focusOnly: boolean;
  useLandscapeColorRail?: boolean;
}) {
  return clsx(
    "min-h-0 min-w-0 w-full self-stretch",
    focusOnly
      ? clsx(
          "relative flex h-screen w-full flex-col",
          useLandscapeColorRail ? "overflow-hidden" : "overflow-x-visible overflow-y-auto",
        )
      : clsx(
          "flex flex-col",
          useLandscapeColorRail ? "h-full overflow-hidden" : "overflow-visible",
        ),
  );
}

export function getPindouPanelSectionInlineStyle({
  mobileApp,
  focusOnly,
  useLandscapeColorRail,
  panelViewportHeight,
}: {
  mobileApp: boolean;
  focusOnly: boolean;
  useLandscapeColorRail: boolean;
  panelViewportHeight: number;
}) {
  if (!mobileApp || focusOnly || !useLandscapeColorRail || panelViewportHeight <= 0) {
    return undefined;
  }

  return {
    height: `${panelViewportHeight}px`,
    minHeight: `${panelViewportHeight}px`,
  } as const;
}

export function getEditPanelSectionInlineStyle({
  mobileApp,
  useSideMountedEditToolRail,
  panelViewportHeight,
}: {
  mobileApp: boolean;
  useSideMountedEditToolRail: boolean;
  panelViewportHeight: number;
}) {
  if (!mobileApp || !useSideMountedEditToolRail || panelViewportHeight <= 0) {
    return undefined;
  }

  return {
    height: `${panelViewportHeight}px`,
    minHeight: `${panelViewportHeight}px`,
  } as const;
}

export function getEditToolRailSectionClassName({
  mobileApp,
  useSideMountedEditToolRail,
  mergeEditToolRailIntoToolbar,
  isDark,
}: {
  mobileApp: boolean;
  useSideMountedEditToolRail: boolean;
  mergeEditToolRailIntoToolbar: boolean;
  isDark: boolean;
}) {
  return clsx(
    mergeEditToolRailIntoToolbar
      ? "px-2 pb-3 pt-2.5"
      : useSideMountedEditToolRail
        ? "min-h-0 min-w-0 h-full overflow-hidden border-r px-1.5 py-1.5 transition-colors"
        : mobileApp
          ? "min-h-0 min-w-0 border-b px-0 pb-2 pt-2 transition-colors lg:border-b-0 lg:border-r lg:p-1.5"
          : "min-h-0 min-w-0 border-b p-2 transition-colors lg:border-b-0 lg:border-r lg:p-1.5",
    mergeEditToolRailIntoToolbar ? "" : isDark ? "border-white/10" : "border-stone-200",
  );
}

export function getEditStageSurfaceInlineStyle({
  useSideMountedEditToolRail,
  railWidthPx,
}: {
  useSideMountedEditToolRail: boolean;
  railWidthPx: number;
}) {
  if (!useSideMountedEditToolRail) {
    return undefined;
  }

  return {
    gridTemplateColumns: `${railWidthPx}px minmax(0,1fr)`,
    gridTemplateRows: "minmax(0,1fr)",
  } as const;
}

export function getEditStageViewportContainerClassName({
  useSharedStageInset,
  fixedViewport,
  useSideMountedEditToolRail,
}: {
  useSharedStageInset: boolean;
  fixedViewport: boolean;
  useSideMountedEditToolRail: boolean;
}) {
  return clsx(
    "min-h-0 min-w-0 overflow-hidden",
    useSharedStageInset ? (useSideMountedEditToolRail ? "" : "px-2 pb-4 pt-3") : "",
    fixedViewport && !useSideMountedEditToolRail
      ? "h-[min(58svh,32rem)] flex-none"
      : "flex h-full flex-1",
  );
}

export function getEffectiveMobileEditPanelHeight({
  panelViewportHeight,
  mobileVisiblePanelHeight,
}: {
  panelViewportHeight: number;
  mobileVisiblePanelHeight: number;
}) {
  const safePanelHeight = panelViewportHeight > 0 ? panelViewportHeight : 0;
  const safeVisibleHeight = mobileVisiblePanelHeight > 0 ? mobileVisiblePanelHeight : 0;
  if (safePanelHeight > 0 && safeVisibleHeight > 0) {
    return Math.min(safePanelHeight, safeVisibleHeight);
  }

  return safeVisibleHeight > 0 ? safeVisibleHeight : safePanelHeight;
}

export function getPindouStageAreaClassName({
  focusOnly,
  reserveFocusToolbarSpace = false,
}: {
  focusOnly: boolean;
  reserveFocusToolbarSpace?: boolean;
}) {
  return clsx("relative min-h-0 min-w-0 flex-1", reserveFocusToolbarSpace && "mt-12");
}

export function getPindouVisiblePanelHeight({
  panelTop,
  navTop,
  viewportHeight,
}: {
  panelTop: number;
  navTop: number | null;
  viewportHeight: number;
}) {
  const visibleBottom = navTop ?? viewportHeight;
  return Math.max(0, Math.round(visibleBottom - panelTop));
}

export function getPixelEditorPanelViewportHeight({
  viewportWidth,
  windowInnerHeight,
  panelTop,
  parentBottom,
}: {
  viewportWidth: number;
  windowInnerHeight: number;
  panelTop: number;
  parentBottom: number | null;
}) {
  const availableBottom = parentBottom ?? windowInnerHeight;
  const availableHeight = Math.max(0, Math.round(availableBottom - panelTop - 24));

  if (viewportWidth < 640) {
    return Math.max(420, availableHeight);
  }

  if (viewportWidth < 1280) {
    return Math.max(420, availableHeight);
  }

  return Math.max(420, availableHeight);
}

export function shouldUsePindouLandscapeColorRail({
  mobileApp,
  isLandscapeViewport,
}: {
  mobileApp: boolean;
  isLandscapeViewport: boolean;
}) {
  return isLandscapeViewport;
}

export function getMobilePindouColorRailViewportBleedStyle(fullBleed: boolean) {
  if (!fullBleed) {
    return undefined;
  }

  return {
    width: "100vw",
    maxWidth: "100vw",
    marginLeft: "calc(50% - 50vw)",
  } as const;
}

export function getMobilePindouStageHeight({
  panelViewportHeight,
  reserveColorRailRows = 2,
  includeHint = true,
}: {
  panelViewportHeight: number;
  reserveColorRailRows?: number;
  includeHint?: boolean;
}) {
  if (panelViewportHeight <= 0) {
    return 0;
  }

  const toolbarReservePx = 88;
  const colorRailRowHeightPx = 44;
  const colorRailBottomPaddingPx = 16;
  const hintHeightPx = includeHint ? 18 : 0;
  const hintGapPx = includeHint ? 4 : 0;
  const sectionSpacingPx = includeHint ? 24 : 12;
  const reservedHeight =
    toolbarReservePx +
    reserveColorRailRows * colorRailRowHeightPx +
    colorRailBottomPaddingPx +
    hintHeightPx +
    hintGapPx +
    sectionSpacingPx;

  return Math.max(220, panelViewportHeight - reservedHeight);
}

export function getMobileEditStageHeight({
  panelViewportHeight,
}: {
  panelViewportHeight: number;
}) {
  if (panelViewportHeight <= 0) {
    return 0;
  }

  const toolbarReservePx = 152;
  const bottomBreathingRoomPx = 44;
  return Math.max(260, panelViewportHeight - toolbarReservePx - bottomBreathingRoomPx);
}

export function getPindouColorRailItemCornerFlags({
  index,
  total,
  columns,
}: {
  index: number;
  total: number;
  columns: number;
}) {
  if (index < 0 || total <= 0 || columns <= 0) {
    return {
      topLeft: false,
      topRight: false,
      bottomLeft: false,
      bottomRight: false,
    };
  }

  const topRightIndex = Math.min(columns, total) - 1;
  const lastRowStart = Math.floor((total - 1) / columns) * columns;

  return {
    topLeft: index === 0,
    topRight: index === topRightIndex,
    bottomLeft: index === lastRowStart,
    bottomRight: index === total - 1,
  };
}

export function getMobileWorkspaceChromeMode({
  panel,
  mobileApp,
  isLandscapeViewport = false,
}: {
  panel: "edit" | "pindou";
  mobileApp: boolean;
  isLandscapeViewport?: boolean;
}) {
  if (!mobileApp) {
    return {
      useSharedToolbarSurface: false,
      useSharedStageInset: false,
      mergeEditToolRailIntoToolbar: false,
      useUnifiedStageShell: false,
    };
  }

  return {
    useSharedToolbarSurface: true,
    useSharedStageInset: true,
    mergeEditToolRailIntoToolbar: panel === "edit" && !isLandscapeViewport,
    useUnifiedStageShell: true,
  };
}

export function shouldRenderStandaloneEditToolRailRow({
  useUnifiedStageShell,
  mergeEditToolRailIntoToolbar,
}: {
  useUnifiedStageShell: boolean;
  mergeEditToolRailIntoToolbar: boolean;
}) {
  return useUnifiedStageShell && mergeEditToolRailIntoToolbar;
}

export function shouldUseSideMountedEditToolRail({
  mobileApp,
  isLandscapeViewport,
  mergeEditToolRailIntoToolbar,
}: {
  mobileApp: boolean;
  isLandscapeViewport: boolean;
  mergeEditToolRailIntoToolbar: boolean;
}) {
  return mobileApp && isLandscapeViewport && !mergeEditToolRailIntoToolbar;
}

export function getAdaptiveEditToolRailLayout({
  availableHeight,
  itemCount,
  buttonSizePx = 40,
  gapPx = 6,
  horizontalPaddingPx = 6,
  verticalPaddingPx = 6,
}: {
  availableHeight: number;
  itemCount: number;
  buttonSizePx?: number;
  gapPx?: number;
  horizontalPaddingPx?: number;
  verticalPaddingPx?: number;
}) {
  const safeHeight = Number.isFinite(availableHeight) && availableHeight > 0 ? availableHeight : 258;
  const slotHeight = buttonSizePx + gapPx;
  const rows = Math.max(
    3,
    Math.min(
      itemCount,
      Math.floor((safeHeight - verticalPaddingPx * 2 + gapPx) / slotHeight) || 1,
    ),
  );
  const columns = Math.max(1, Math.ceil(itemCount / rows));
  const railWidthPx = columns * buttonSizePx + Math.max(0, columns - 1) * gapPx + horizontalPaddingPx * 2;

  return {
    rows,
    columns,
    railWidthPx,
  };
}

export function getMobileLandscapeEditToolRailAvailableHeight({
  measuredHeight,
  mobileApp,
  isLandscapeViewport,
  useSideMountedEditToolRail,
  bottomToolbarReservePx = 68,
}: {
  measuredHeight: number;
  mobileApp: boolean;
  isLandscapeViewport: boolean;
  useSideMountedEditToolRail: boolean;
  bottomToolbarReservePx?: number;
}) {
  const safeHeight = Number.isFinite(measuredHeight) && measuredHeight > 0 ? measuredHeight : 0;
  if (!mobileApp || !isLandscapeViewport || !useSideMountedEditToolRail) {
    return safeHeight;
  }

  return Math.max(0, safeHeight - bottomToolbarReservePx);
}

export function getUnifiedWorkspaceShellCorners() {
  return "rounded-[14px] sm:rounded-[16px] xl:rounded-[18px]";
}

export function getPindouColorRailHintClassName({
  hintCentered,
  hintPlacement,
}: {
  hintCentered: boolean;
  hintPlacement: string;
}) {
  return clsx(
    "text-xs",
    hintPlacement === "above" ? "mt-3 mb-1" : "mb-1",
    hintCentered && "text-center",
  );
}

export function getPindouColorRailRenderSlotCount({
  itemCount,
  columns,
  equalWidthGrid,
}: {
  itemCount: number;
  columns: number;
  equalWidthGrid: boolean;
}) {
  if (!equalWidthGrid || columns <= 0) {
    return itemCount;
  }

  const remainder = itemCount % columns;
  return remainder === 0 ? itemCount : itemCount + (columns - remainder);
}

export function getPindouColorRailDummySlotClassName({
  equalWidthGrid,
  roundOuterCorners,
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
}: {
  equalWidthGrid: boolean;
  roundOuterCorners: boolean;
  topLeft: boolean;
  topRight: boolean;
  bottomLeft: boolean;
  bottomRight: boolean;
}) {
  return clsx(
    equalWidthGrid && "min-h-11 w-full min-w-0 rounded-none border border-stone-300 bg-[#faf7f1]",
    roundOuterCorners && equalWidthGrid && topLeft && "rounded-tl-[10px]",
    roundOuterCorners && equalWidthGrid && topRight && "rounded-tr-[10px]",
    roundOuterCorners && equalWidthGrid && bottomLeft && "rounded-bl-[10px]",
    roundOuterCorners && equalWidthGrid && bottomRight && "rounded-br-[10px]",
  );
}

export function shouldRoundPindouColorRailOuterCorners({
  mobileApp,
  focusOnly,
  equalWidthGrid,
}: {
  mobileApp: boolean;
  focusOnly: boolean;
  equalWidthGrid: boolean;
}) {
  return equalWidthGrid && (!mobileApp || !focusOnly);
}

export function getPindouFocusButtonClassName({
  mobileApp,
  focusOnly,
}: {
  mobileApp: boolean;
  focusOnly: boolean;
}) {
  if (mobileApp) {
    return clsx(
      "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition",
      focusOnly && "pointer-events-auto shadow-sm backdrop-blur",
    );
  }

  return clsx(
    "flex h-10 shrink-0 items-center gap-2 rounded-md border px-3 transition",
    focusOnly && "pointer-events-auto shadow-sm backdrop-blur",
  );
}

export function getMobileWorkspaceStageRegionMode({
  panel,
  mobileApp,
}: {
  panel: "edit" | "pindou";
  mobileApp: boolean;
}) {
  if (!mobileApp) {
    return {
      fixedViewport: false,
      squareViewport: false,
    };
  }

  return {
    fixedViewport: panel === "edit",
    squareViewport: false,
  };
}

function formatProcessingElapsed(elapsedMs: number) {
  if (elapsedMs >= 1000) {
    return `${(elapsedMs / 1000).toFixed(elapsedMs >= 10_000 ? 1 : 2)} s`;
  }
  return `${Math.round(elapsedMs)} ms`;
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

