import clsx from "clsx";
import { LayoutGrid, Pencil, SlidersHorizontal, Upload } from "lucide-react";
import { useEffect, useState, type MutableRefObject, type ReactNode } from "react";
import type { Messages } from "../lib/i18n";
import type { NormalizedCropRect, ProcessResult } from "../lib/chart-processor";
import type { CanvasCropRect, EditTool } from "../lib/editor-utils";
import type { PindouBeadShape, PindouBoardTheme } from "../lib/pindou-board-theme";
import { getThemeClasses } from "../lib/theme";
import {
  getEditorModeForMobileWorkspacePage,
  getMobileWorkspacePageForEditorMode,
  getMobileWorkspaceViewportHeightPx,
  resolveMobileWorkspacePage,
  resolveMobileWorkspacePageAfterProcessing,
  type MobileWorkspacePage,
} from "../lib/workspace-layout";
import { MobileWorkspaceBusyOverlay, WorkspaceBusyIndicator } from "./workspace-busy-overlay";
import { ChartSettingsTab } from "./chart-settings-tab";
import { summarizeStageColors } from "./pixel-editor-color-picker";
import { EditModeWorkspace, formatProcessingElapsedNote, PindouModePanel, PixelEditorPanel, type EditorPanelMode } from "./pixel-editor-panel";
import { SidebarPanel } from "./sidebar-panel";

const MOBILE_WORKSPACE_BOTTOM_CLEARANCE = "calc(env(safe-area-inset-bottom) + 5rem)";

export function getMobileWorkspaceTabAccent(
  page: MobileWorkspacePage,
  isDark: boolean,
) {
  if (isDark) {
    switch (page) {
      case "image-process":
        return "#72d7a2";
      case "edit":
        return "#ffd45f";
      case "pindou":
        return "#ff8a63";
      case "export":
        return "#78c7ff";
    }
  }

  switch (page) {
    case "image-process":
      return "#2ea36c";
    case "edit":
      return "#d6a41d";
    case "pindou":
      return "#df6a41";
    case "export":
      return "#4c8fe8";
  }
}

export function getMobileWorkspaceTabLabelStyle(
  _active: boolean,
  _tabAccent: string | undefined,
) {
  return undefined;
}

export function getMobileWorkspaceBusyOverlayLayout() {
  return {
    coverRegion: "content-only" as const,
    excludesTopBanner: true,
    excludesBottomToolbar: true,
  };
}

export function shouldUseMobileFocusPindouLayout(
  layout: "desktop" | "mobile",
  focusOnly: boolean,
) {
  return layout === "mobile" && focusOnly;
}

export function getMobileWorkspaceProcessingSyncKey({
  preferredEditorModeSeed,
  preferredEditorMode,
  editingLocked,
}: {
  preferredEditorModeSeed: string | null;
  preferredEditorMode: EditorPanelMode;
  editingLocked: boolean;
}) {
  return `${preferredEditorModeSeed ?? ""}::${preferredEditorMode}::${editingLocked ? 1 : 0}`;
}

export function getMobileWorkspaceContentRegionStyle(mobileNavHeight: string) {
  return {
    paddingBottom: mobileNavHeight,
  } as const;
}

export function WorkspacePanels({
  t,
  file,
  inputUrl,
  sourceBadge,
  sourceFocusViewOpen,
  onSourceFocusViewOpenChange,
  cropMode,
  onCropModeChange,
  cropRect,
  displayCropRect,
  onCropChange,
  result,
  busy,
  stageBusy,
  isDark,
  gridMode,
  onGridModeChange,
  gridWidth,
  gridHeight,
  onGridWidthChange,
  onGridHeightChange,
  followSourceRatio,
  onFollowSourceRatioChange,
  grayscaleMode,
  onGrayscaleModeChange,
  contrast,
  onContrastChange,
  renderStyleBias,
  onRenderStyleBiasChange,
  reduceColors,
  onReduceColorsChange,
  reduceTolerance,
  onReduceToleranceChange,
  preSharpen,
  onPreSharpenChange,
  preSharpenStrength,
  onPreSharpenStrengthChange,
  fftEdgeEnhanceStrength,
  fftEdgeEnhanceOverrideLabel,
  onFftEdgeEnhanceStrengthChange,
  onFftEdgeEnhanceOverrideLabelChange,
  onFileSelection,
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
  lockColorSystem = false,
  onColorSystemIdChange,
  paletteOptions,
  currentCells,
  editorGridWidth,
  editorGridHeight,
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
  layout = "desktop",
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
}: {
  t: Messages;
  file: File | null;
  inputUrl: string | null;
  sourceBadge: { kind: "chart" | "pixel-art" | "image"; label: string } | null;
  sourceFocusViewOpen: boolean;
  onSourceFocusViewOpenChange: (value: boolean) => void;
  cropMode: boolean;
  onCropModeChange: (enabled: boolean) => void;
  cropRect: NormalizedCropRect | null;
  displayCropRect: NormalizedCropRect | null;
  onCropChange: (cropRect: NormalizedCropRect | null) => void;
  result: (ProcessResult & { url: string }) | null;
  busy: boolean;
  stageBusy: boolean;
  isDark: boolean;
  gridMode: "auto" | "manual";
  onGridModeChange: (value: "auto" | "manual") => void;
  gridWidth: string;
  gridHeight: string;
  onGridWidthChange: (value: string) => void;
  onGridHeightChange: (value: string) => void;
  followSourceRatio: boolean;
  onFollowSourceRatioChange: (checked: boolean) => void;
  grayscaleMode: boolean;
  onGrayscaleModeChange: (checked: boolean) => void;
  contrast: number;
  onContrastChange: (value: number) => void;
  renderStyleBias: number;
  onRenderStyleBiasChange: (value: number) => void;
  reduceColors: boolean;
  onReduceColorsChange: (checked: boolean) => void;
  reduceTolerance: number;
  onReduceToleranceChange: (value: number) => void;
  preSharpen: boolean;
  onPreSharpenChange: (checked: boolean) => void;
  preSharpenStrength: number;
  onPreSharpenStrengthChange: (value: number) => void;
  fftEdgeEnhanceStrength: number;
  fftEdgeEnhanceOverrideLabel: string | null;
  onFftEdgeEnhanceStrengthChange: (value: number) => void;
  onFftEdgeEnhanceOverrideLabelChange: (value: string | null) => void;
  onFileSelection: (file: File | null) => void;
  editTool: EditTool;
  onEditToolChange: (tool: EditTool) => void;
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
  lockColorSystem?: boolean;
  onColorSystemIdChange: (value: string) => void;
  paletteOptions: Array<{ label: string; hex: string }>;
  currentCells: ProcessResult["cells"];
  editorGridWidth: number;
  editorGridHeight: number;
  onApplyCell: (
    index: number,
    toolOverride?: EditTool,
  ) => void;
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
  layout?: "desktop" | "mobile";
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
}) {
  const theme = getThemeClasses(isDark);
  const mobileFocusPindouLayout = shouldUseMobileFocusPindouLayout(layout, focusOnly);

  if (layout === "mobile" && !focusOnly) {
    return (
      <MobileWorkspaceShell
        t={t}
        inputUrl={inputUrl}
        cropRect={cropRect}
        result={result}
        busy={busy}
        stageBusy={stageBusy}
        isDark={isDark}
        editTool={editTool}
        onEditToolChange={onEditToolChange}
        editZoom={editZoom}
        onEditZoomChange={onEditZoomChange}
        editFlipHorizontal={editFlipHorizontal}
        onEditFlipHorizontalChange={onEditFlipHorizontalChange}
        overlayEnabled={overlayEnabled}
        onOverlayEnabledChange={onOverlayEnabledChange}
        fillTolerance={fillTolerance}
        onFillToleranceChange={onFillToleranceChange}
        brushSize={brushSize}
        onBrushSizeChange={onBrushSizeChange}
        disabledResultLabels={disabledResultLabels}
        matchedColorsBase={matchedColorsBase}
        matchedCoveragePercent={matchedCoveragePercent}
        onMatchedCoveragePercentChange={onMatchedCoveragePercentChange}
        onToggleMatchedColor={onToggleMatchedColor}
        onReplaceMatchedColor={onReplaceMatchedColor}
        selectedLabel={selectedLabel}
        onSelectedLabelChange={onSelectedLabelChange}
        colorSystemId={colorSystemId}
        lockColorSystem={lockColorSystem}
        onColorSystemIdChange={onColorSystemIdChange}
        paletteOptions={paletteOptions}
        currentCells={currentCells}
        editorGridWidth={editorGridWidth}
        editorGridHeight={editorGridHeight}
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
        focusViewOpen={focusViewOpen}
        onFocusViewOpenChange={onFocusViewOpenChange}
        preferredEditorMode={preferredEditorMode}
        preferredEditorModeSeed={preferredEditorModeSeed}
        onPreferredEditorModeChange={onPreferredEditorModeChange}
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
        chartExportTitle={chartExportTitle}
        onChartExportTitleChange={onChartExportTitleChange}
        chartWatermarkText={chartWatermarkText}
        onChartWatermarkTextChange={onChartWatermarkTextChange}
        chartWatermarkImageDataUrl={chartWatermarkImageDataUrl}
        chartWatermarkImageName={chartWatermarkImageName}
        onChartWatermarkImageFile={onChartWatermarkImageFile}
        onChartWatermarkImageClear={onChartWatermarkImageClear}
        editingLocked={editingLocked}
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
        saveBusy={saveBusy}
        sourceFocusViewOpen={sourceFocusViewOpen}
        onSourceFocusViewOpenChange={onSourceFocusViewOpenChange}
        file={file}
        sourceBadge={sourceBadge}
        cropMode={cropMode}
        onCropModeChange={onCropModeChange}
        displayCropRect={displayCropRect}
        onCropChange={onCropChange}
        gridMode={gridMode}
        onGridModeChange={onGridModeChange}
        gridWidth={gridWidth}
        gridHeight={gridHeight}
        onGridWidthChange={onGridWidthChange}
        onGridHeightChange={onGridHeightChange}
        followSourceRatio={followSourceRatio}
        onFollowSourceRatioChange={onFollowSourceRatioChange}
        grayscaleMode={grayscaleMode}
        onGrayscaleModeChange={onGrayscaleModeChange}
        contrast={contrast}
        onContrastChange={onContrastChange}
        renderStyleBias={renderStyleBias}
        onRenderStyleBiasChange={onRenderStyleBiasChange}
        reduceColors={reduceColors}
        onReduceColorsChange={onReduceColorsChange}
        reduceTolerance={reduceTolerance}
        onReduceToleranceChange={onReduceToleranceChange}
        preSharpen={preSharpen}
        onPreSharpenChange={onPreSharpenChange}
        preSharpenStrength={preSharpenStrength}
        onPreSharpenStrengthChange={onPreSharpenStrengthChange}
        fftEdgeEnhanceStrength={fftEdgeEnhanceStrength}
        fftEdgeEnhanceOverrideLabel={fftEdgeEnhanceOverrideLabel}
        onFftEdgeEnhanceStrengthChange={onFftEdgeEnhanceStrengthChange}
        onFftEdgeEnhanceOverrideLabelChange={onFftEdgeEnhanceOverrideLabelChange}
        onFileSelection={onFileSelection}
      />
    );
  }

  if (focusOnly) {
    return (
      <section className="flex min-h-full min-w-0 flex-col overflow-visible">
        {result ? (
          <PixelEditorPanel
            t={t}
            isDark={isDark}
            busy={busy}
            stageBusy={stageBusy}
            cells={currentCells}
            gridWidth={editorGridWidth}
            gridHeight={editorGridHeight}
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
            focusViewOpen={focusViewOpen}
            onFocusViewOpenChange={onFocusViewOpenChange}
            focusOnly
            preferredMode={preferredEditorMode}
            preferredModeSeed={preferredEditorModeSeed}
            onPreferredModeChange={onPreferredEditorModeChange}
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
            processingElapsedMs={result.processingElapsedMs}
            chartExportTitle={chartExportTitle}
            onChartExportTitleChange={onChartExportTitleChange}
            chartWatermarkText={chartWatermarkText}
            onChartWatermarkTextChange={onChartWatermarkTextChange}
            chartWatermarkImageDataUrl={chartWatermarkImageDataUrl}
            chartWatermarkImageName={chartWatermarkImageName}
            onChartWatermarkImageFile={onChartWatermarkImageFile}
            onChartWatermarkImageClear={onChartWatermarkImageClear}
            editingLocked={editingLocked}
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
            saveBusy={saveBusy}
            mobileApp={mobileFocusPindouLayout}
          />
        ) : null}
      </section>
    );
  }

  const useAutoHeightChartLayout = preferredEditorMode === "chart";

  return (
    <section
      className={clsx(
        "flex min-w-0 flex-col overflow-visible sm:min-h-[72vh]",
        useAutoHeightChartLayout ? "min-h-0 lg:overflow-visible" : "min-h-[78vh] lg:min-h-0 lg:overflow-hidden",
      )}
    >
      {result || busy ? (
        <PixelEditorPanel
          t={t}
          isDark={isDark}
          busy={busy}
          stageBusy={stageBusy}
          cells={result ? currentCells : []}
          gridWidth={result ? editorGridWidth : 33}
          gridHeight={result ? editorGridHeight : 33}
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
          focusViewOpen={focusViewOpen}
          onFocusViewOpenChange={onFocusViewOpenChange}
          preferredMode={preferredEditorMode}
          preferredModeSeed={preferredEditorModeSeed}
          onPreferredModeChange={onPreferredEditorModeChange}
          resultReady={Boolean(result)}
          originalUniqueColors={result?.originalUniqueColors ?? 0}
          reducedUniqueColors={result?.reducedUniqueColors ?? 0}
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
          processingElapsedMs={result?.processingElapsedMs ?? 0}
          chartExportTitle={chartExportTitle}
          onChartExportTitleChange={onChartExportTitleChange}
          chartWatermarkText={chartWatermarkText}
          onChartWatermarkTextChange={onChartWatermarkTextChange}
          chartWatermarkImageDataUrl={chartWatermarkImageDataUrl}
          chartWatermarkImageName={chartWatermarkImageName}
          onChartWatermarkImageFile={onChartWatermarkImageFile}
          onChartWatermarkImageClear={onChartWatermarkImageClear}
          editingLocked={editingLocked}
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
          saveBusy={saveBusy}
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

type WorkspacePanelsProps = Parameters<typeof WorkspacePanels>[0];

function MobileWorkspaceShell(props: WorkspacePanelsProps) {
  const {
    t,
    file,
    inputUrl,
    sourceBadge,
    sourceFocusViewOpen,
    onSourceFocusViewOpenChange,
    cropMode,
    onCropModeChange,
    cropRect,
    displayCropRect,
    onCropChange,
    result,
    busy,
    stageBusy,
    isDark,
    gridMode,
    onGridModeChange,
    gridWidth,
    gridHeight,
    onGridWidthChange,
    onGridHeightChange,
    followSourceRatio,
    onFollowSourceRatioChange,
    paletteOptions,
    grayscaleMode,
    onGrayscaleModeChange,
    contrast,
    onContrastChange,
    renderStyleBias,
    onRenderStyleBiasChange,
    reduceColors,
    onReduceColorsChange,
    reduceTolerance,
    onReduceToleranceChange,
    preSharpen,
    onPreSharpenChange,
    preSharpenStrength,
    onPreSharpenStrengthChange,
    fftEdgeEnhanceStrength,
    fftEdgeEnhanceOverrideLabel,
    onFftEdgeEnhanceStrengthChange,
    onFftEdgeEnhanceOverrideLabelChange,
    onFileSelection,
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
    lockColorSystem = false,
    onColorSystemIdChange,
    currentCells,
    editorGridWidth,
    editorGridHeight,
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
  } = props;
  const theme = getThemeClasses(isDark);
  const busyOverlayLayout = getMobileWorkspaceBusyOverlayLayout();
  const processingSyncKey = getMobileWorkspaceProcessingSyncKey({
    preferredEditorModeSeed,
    preferredEditorMode,
    editingLocked,
  });
  const [mobilePage, setMobilePage] = useState<MobileWorkspacePage>(() =>
    resolveMobileWorkspacePage(
      result ? getMobileWorkspacePageForEditorMode(preferredEditorMode) : "image-process",
      editingLocked,
    ),
  );
  const hasRenderableResult = Boolean(result);
  const processingElapsedNote = formatProcessingElapsedNote(result?.processingElapsedMs ?? 0);
  const pindouColors = summarizeStageColors(
    hasRenderableResult ? currentCells : [],
    paletteOptions,
  );
  const [focusedSketchLabel, setFocusedSketchLabel] = useState<string | null>(null);
  const [mobileViewportHeightPx, setMobileViewportHeightPx] = useState(() =>
    typeof window === "undefined"
      ? 0
      : getMobileWorkspaceViewportHeightPx(
          Math.round(window.visualViewport?.height ?? window.innerHeight),
        ),
  );

  useEffect(() => {
    function syncMobileViewportHeight() {
      setMobileViewportHeightPx(
        getMobileWorkspaceViewportHeightPx(
          Math.round(window.visualViewport?.height ?? window.innerHeight),
        ),
      );
    }

    syncMobileViewportHeight();
    window.addEventListener("resize", syncMobileViewportHeight);
    window.visualViewport?.addEventListener("resize", syncMobileViewportHeight);
    window.visualViewport?.addEventListener("scroll", syncMobileViewportHeight);
    return () => {
      window.removeEventListener("resize", syncMobileViewportHeight);
      window.visualViewport?.removeEventListener("resize", syncMobileViewportHeight);
      window.visualViewport?.removeEventListener("scroll", syncMobileViewportHeight);
    };
  }, []);

  useEffect(() => {
    setMobilePage(resolveMobileWorkspacePage("image-process", editingLocked));
  }, [preferredEditorModeSeed, editingLocked]);

  useEffect(() => {
    setMobilePage((current) =>
      resolveMobileWorkspacePageAfterProcessing({
        currentPage: current,
        preferredEditorMode,
        editingLocked,
      }),
    );
  }, [processingSyncKey, editingLocked, preferredEditorMode]);

  useEffect(() => {
    if (!focusedSketchLabel) {
      return;
    }

    if (!pindouColors.some((entry) => entry.label === focusedSketchLabel)) {
      setFocusedSketchLabel(null);
    }
  }, [focusedSketchLabel, pindouColors]);

  const resolvedPage = resolveMobileWorkspacePage(mobilePage, editingLocked);
  const mobileNavHeight = "calc(env(safe-area-inset-bottom) + 4.25rem)";
  const mobileWorkspaceViewportStyle =
    mobileViewportHeightPx > 0 ? ({ height: `${mobileViewportHeightPx}px` } as const) : undefined;

  const items: Array<{
    page: MobileWorkspacePage;
    label: string;
    icon: typeof SlidersHorizontal;
    disabled: boolean;
  }> = [
    {
      page: "image-process",
      label: t.mobileWorkspaceImageProcess,
      icon: SlidersHorizontal,
      disabled: false,
    },
    {
      page: "edit",
      label: t.mobileWorkspacePixelDraw,
      icon: Pencil,
      disabled: editingLocked,
    },
    {
      page: "pindou",
      label: t.mobileWorkspacePindou,
      icon: LayoutGrid,
      disabled: false,
    },
    {
      page: "export",
      label: t.mobileWorkspaceExport,
      icon: Upload,
      disabled: editingLocked,
    },
  ];

  function handlePageChange(nextPage: MobileWorkspacePage) {
    const resolved = resolveMobileWorkspacePage(nextPage, editingLocked);
    setMobilePage(resolved);
    const nextMode = getEditorModeForMobileWorkspacePage(resolved);
    if (nextMode) {
      onPreferredEditorModeChange?.(nextMode);
    }
  }

  let content: ReactNode;
  if (resolvedPage === "image-process") {
    content = (
      <SidebarPanel
        t={t}
        file={file}
        inputUrl={inputUrl}
        sourceBadge={sourceBadge}
        sourceFocusViewOpen={sourceFocusViewOpen}
        onSourceFocusViewOpenChange={onSourceFocusViewOpenChange}
        cropMode={cropMode}
        onCropModeChange={onCropModeChange}
        cropRect={cropRect}
        displayCropRect={displayCropRect}
        onCropChange={onCropChange}
        busy={busy}
        isDark={isDark}
        gridMode={gridMode}
        onGridModeChange={onGridModeChange}
        gridWidth={gridWidth}
        gridHeight={gridHeight}
        onGridWidthChange={onGridWidthChange}
        onGridHeightChange={onGridHeightChange}
        followSourceRatio={followSourceRatio}
        onFollowSourceRatioChange={onFollowSourceRatioChange}
        paletteOptions={paletteOptions}
        grayscaleMode={grayscaleMode}
        onGrayscaleModeChange={onGrayscaleModeChange}
        contrast={contrast}
        onContrastChange={onContrastChange}
        renderStyleBias={renderStyleBias}
        onRenderStyleBiasChange={onRenderStyleBiasChange}
        reduceColors={reduceColors}
        onReduceColorsChange={onReduceColorsChange}
        reduceTolerance={reduceTolerance}
        onReduceToleranceChange={onReduceToleranceChange}
        preSharpen={preSharpen}
        onPreSharpenChange={onPreSharpenChange}
        preSharpenStrength={preSharpenStrength}
        onPreSharpenStrengthChange={onPreSharpenStrengthChange}
        fftEdgeEnhanceStrength={fftEdgeEnhanceStrength}
        fftEdgeEnhanceOverrideLabel={fftEdgeEnhanceOverrideLabel}
        onFftEdgeEnhanceStrengthChange={onFftEdgeEnhanceStrengthChange}
        onFftEdgeEnhanceOverrideLabelChange={onFftEdgeEnhanceOverrideLabelChange}
        onFileSelection={onFileSelection}
        variant="mobile-app"
      />
    );
  } else if (!hasRenderableResult && !busy) {
    content = <MobileWorkspacePlaceholder isDark={isDark} text={t.readyHint} busy={false} />;
  } else if (resolvedPage === "edit") {
    content = (
      <MobileWorkspaceSurface isDark={isDark}>
        <EditModeWorkspace
          t={t}
          isDark={isDark}
          cells={hasRenderableResult ? currentCells : []}
          gridWidth={hasRenderableResult ? editorGridWidth : 33}
          gridHeight={hasRenderableResult ? editorGridHeight : 33}
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
          matchedColors={matchedColorsBase}
          disabledResultLabels={disabledResultLabels}
          matchedCoveragePercent={matchedCoveragePercent}
          onMatchedCoveragePercentChange={onMatchedCoveragePercentChange}
          onToggleMatchedColor={onToggleMatchedColor}
          onReplaceMatchedColor={onReplaceMatchedColor}
          stageBusy={stageBusy}
          processingElapsedNote={processingElapsedNote}
          mobileApp
        />
      </MobileWorkspaceSurface>
    );
  } else if (resolvedPage === "pindou") {
    content = (
      <MobileWorkspaceSurface isDark={isDark}>
        <PindouModePanel
          t={t}
          isDark={isDark}
          busy={busy}
          stageBusy={stageBusy}
          cells={hasRenderableResult ? currentCells : []}
          gridWidth={hasRenderableResult ? editorGridWidth : 33}
          gridHeight={hasRenderableResult ? editorGridHeight : 33}
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
          processingElapsedNote={processingElapsedNote}
          mobileApp
        />
      </MobileWorkspaceSurface>
    );
  } else {
    content = hasRenderableResult ? (
      <MobileWorkspaceSurface isDark={isDark} scrollable>
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
          saveBusy={saveBusy || busy || !hasRenderableResult}
          variant="mobile-app"
        />
      </MobileWorkspaceSurface>
    ) : (
      <MobileWorkspacePlaceholder isDark={isDark} text={t.readyHint} busy={busy} />
    );
  }

  return (
    <section
      className="relative flex w-full min-w-0 flex-1 flex-col overflow-hidden"
      style={mobileWorkspaceViewportStyle}
    >
      <div
        className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col"
        style={getMobileWorkspaceContentRegionStyle(mobileNavHeight)}
      >
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
          {content}
        </div>
        {busy && busyOverlayLayout.coverRegion === "content-only" ? (
          <MobileWorkspaceBusyOverlay isDark={isDark} />
        ) : null}
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90]">
        <nav
          data-mobile-workspace-nav="true"
          className={clsx(
            "pointer-events-auto flex w-full items-stretch border-t px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-1.5 backdrop-blur-xl",
            isDark
              ? "border-white/10 bg-[#120e0b]/94 shadow-[0_-10px_30px_rgba(0,0,0,0.28)]"
              : "border-stone-200 bg-[#f7f1e4]/96 shadow-[0_-10px_28px_rgba(86,56,21,0.08)]",
          )}
          style={{ minHeight: mobileNavHeight }}
        >
          {items.map((item) => {
            const active = resolvedPage === item.page;
            const Icon = item.icon;
            const tabAccent = active ? getMobileWorkspaceTabAccent(item.page, isDark) : undefined;
            return (
              <button
                aria-current={active ? "page" : undefined}
                key={item.page}
                data-mobile-workspace-tab={item.page}
                className={clsx(
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] px-1.5 py-1.5 leading-none transition",
                  active
                    ? isDark
                      ? "bg-white/10 text-stone-50"
                      : "bg-[#201811] text-[#fff5e7]"
                    : isDark
                      ? "text-stone-400"
                      : "text-stone-600",
                  item.disabled && "cursor-not-allowed opacity-45",
                )}
                disabled={item.disabled}
                onClick={() => handlePageChange(item.page)}
                type="button"
              >
                <Icon
                  className="h-5 w-5"
                  style={
                    tabAccent
                      ? {
                          color: tabAccent,
                          filter: isDark ? "drop-shadow(0 0 6px rgba(255,255,255,0.08))" : undefined,
                        }
                      : undefined
                  }
                />
                <span
                  className={clsx(
                    "max-w-full truncate text-[0.68em] font-medium leading-[1.1]",
                    active ? "opacity-100" : "opacity-78",
                  )}
                  style={getMobileWorkspaceTabLabelStyle(active, tabAccent)}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </section>
  );
}

function MobileWorkspaceSurface({
  isDark: _isDark,
  children,
  scrollable = false,
}: {
  isDark?: boolean;
  children: ReactNode;
  scrollable?: boolean;
}) {
  return (
    <section
      className={clsx(
        "min-h-0 flex-1 bg-transparent",
        scrollable ? "overflow-y-auto overflow-x-hidden" : "overflow-hidden",
      )}
      style={scrollable ? { paddingBottom: MOBILE_WORKSPACE_BOTTOM_CLEARANCE } : undefined}
    >
      {children}
    </section>
  );
}

function MobileWorkspacePlaceholder({
  isDark,
  text,
  busy,
}: {
  isDark: boolean;
  text: string;
  busy: boolean;
}) {
  const theme = getThemeClasses(isDark);

  return (
    <MobileWorkspaceSurface isDark={isDark}>
      <div
        className={clsx(
          "flex h-full min-h-[220px] items-center justify-center rounded-[10px] border border-dashed px-5 py-10 text-center text-sm transition-colors",
          theme.emptyState,
        )}
      >
        {busy ? (
          <WorkspaceBusyIndicator isDark={isDark} />
        ) : (
          text
        )}
      </div>
    </MobileWorkspaceSurface>
  );
}
