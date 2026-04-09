import * as Tabs from "@radix-ui/react-tabs";
import * as Slider from "@radix-ui/react-slider";
import clsx from "clsx";
import { createPortal } from "react-dom";
import {
  Eraser,
  Hand,
  Eye,
  EyeOff,
  FlipHorizontal,
  Maximize2,
  Minimize2,
  Minus,
  PaintBucket,
  Pencil,
  Pipette,
  Plus,
  Redo2,
  Search,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { CanvasEditorStage, clampEditorZoom, clampPindouZoom } from "./canvas-editor-stage";
import type { Messages } from "../lib/i18n";
import { colorSystemOptions, measureHexDistance255, type EditableCell, type NormalizedCropRect } from "../lib/mard";
import { getThemeClasses } from "../lib/theme";

type EditTool = "paint" | "erase" | "pick" | "fill" | "pan" | "zoom";
export type EditorPanelMode = "edit" | "pindou";
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
  resultUrl,
  resultFileName,
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
  pindouZoom,
  onPindouZoomChange,
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
  onApplyCell: (index: number) => void;
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
  resultUrl: string;
  resultFileName: string;
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
  pindouZoom: number;
  onPindouZoomChange: (value: number) => void;
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
              className={clsx(
                "shrink-0 rounded-t-[10px] px-4 py-2 text-sm font-semibold outline-none transition",
                panelMode === value
                  ? clsx(theme.panel, theme.cardTitle, "translate-y-px shadow-sm")
                  : clsx(theme.controlSegment, theme.cardMuted, "opacity-100 hover:brightness-95"),
              )}
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <a
          className={clsx(
            "shrink-0 rounded-t-[10px] px-4 py-2 text-sm font-semibold transition",
            theme.primaryButton,
          )}
          href={resultUrl}
          download={resultFileName}
        >
          {t.downloadPng}
        </a>
      </div>

      <section
        ref={panelBodyRef}
        className={clsx("flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] rounded-tl-none rounded-tr-none border p-3 backdrop-blur transition-colors sm:rounded-[16px] sm:rounded-tl-none sm:rounded-tr-none sm:p-4 xl:rounded-[18px] xl:rounded-tl-none xl:rounded-tr-none", theme.panel)}
        style={panelViewportHeight > 0 ? { height: `${panelViewportHeight}px`, minHeight: `${panelViewportHeight}px` } : undefined}
      >
        <Tabs.Content value="edit" className="mt-4 flex min-h-0 flex-1">
          <div className="flex h-full min-w-0 flex-1 flex-col gap-3 xl:grid xl:grid-cols-[56px_minmax(0,1fr)] xl:items-stretch xl:gap-4">
            <section className={clsx("min-h-0 min-w-0 self-start rounded-[10px] border p-2 transition-colors xl:self-auto", theme.card)}>
              <div className="flex w-full flex-wrap gap-2 overflow-visible xl:flex-col xl:flex-nowrap">
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
                <div className={clsx("hidden h-px xl:block", theme.divider)} />
                <div className="flex basis-full gap-2 xl:contents">
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
                  <div className={clsx("hidden h-px xl:block", theme.divider)} />
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

            <section className={clsx("relative flex min-h-0 min-w-0 flex-1 flex-col rounded-[10px] border p-3 transition-colors sm:p-4", theme.card)}>
              <div data-edit-toolbar-row="true" className="flex min-w-0 flex-wrap items-start gap-2 sm:flex-nowrap">
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
                  />
                </div>
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
              </div>

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
              />
            </section>
          </div>
        </Tabs.Content>

        <Tabs.Content value="pindou" className="mt-4 flex min-h-0 w-full flex-1">
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
            pindouZoom={pindouZoom}
            onPindouZoomChange={onPindouZoomChange}
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
  pindouZoom: number;
  onPindouZoomChange: (value: number) => void;
}) {
  const theme = getThemeClasses(isDark);
  const flipHorizontalLabel = t.pindouFlipHorizontal ?? "Flip Horizontally";

  return (
    <section
      className={clsx(
        "min-h-0 min-w-0 w-full self-stretch",
        focusOnly
          ? "relative mx-auto flex h-[calc(100vh-2rem)] w-full max-w-[1600px] flex-col overflow-hidden sm:h-[calc(100vh-3rem)]"
          : clsx("flex h-full flex-col rounded-[10px] border p-3 transition-colors sm:p-4", theme.card),
      )}
    >
      {focusOnly ? (
        <div className="pointer-events-none absolute right-3 top-3 z-30 flex items-center gap-2 sm:right-4 sm:top-4">
          <div className={clsx("pointer-events-auto flex h-10 items-center gap-1 rounded-md border px-1 py-0.5 shadow-sm backdrop-blur", theme.pill)}>
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
            className={clsx("pointer-events-auto flex h-10 w-10 items-center justify-center rounded-md border shadow-sm backdrop-blur transition", theme.pill)}
            onClick={() => onFocusViewOpenChange(false)}
            title={t.pindouExitFocus}
            type="button"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <p className={clsx("text-xs", theme.cardMuted)}>{t.pindouModeHint}</p>
            <div className={clsx("flex h-10 items-center gap-1 rounded-md border px-1 py-0.5", theme.pill)}>
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
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition",
                pindouFlipHorizontal ? theme.controlButtonActive : theme.pill,
              )}
              onClick={() => onPindouFlipHorizontalChange(!pindouFlipHorizontal)}
              title={flipHorizontalLabel}
              type="button"
            >
              <FlipHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">{flipHorizontalLabel}</span>
            </button>
            <button
              className={clsx("flex h-9 w-9 items-center justify-center rounded-md border transition", theme.pill)}
              onClick={() => onFocusViewOpenChange(!focusViewOpen)}
              title={t.pindouFocusView}
              type="button"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

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
        pindouZoom={pindouZoom}
        onPindouZoomChange={onPindouZoomChange}
        busy={busy}
      />

      <div
        className={clsx(
          "mt-4 flex w-full min-w-0 self-stretch flex-wrap gap-2 overflow-auto pr-1",
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
    hostRect === null
      ? 12
      : Math.min(
          window.innerWidth - detailsPopupWidth - 12,
          Math.max(12, hostRect.left),
        );
  const detailsPopupTop =
    triggerRect === null
      ? 12
      : detailsShowBelow
        ? triggerRect.bottom - 1
        : Math.max(12, triggerRect.top - 248 + 1);
  const detailsColumns = Math.max(1, Math.min(6, Math.floor((detailsPopupWidth - 24) / 112)));
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
              detailsShowBelow ? "rounded-tr-none" : "rounded-br-none",
              isDark ? "border-white/10" : "border-stone-200",
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
              className="mt-3 grid max-h-[220px] gap-2 overflow-auto pr-1"
              style={{ gridTemplateColumns: `repeat(${detailsColumns}, minmax(0, 1fr))` }}
            >
              {matchedColors.map((color) => (
                <button
                  key={color.label}
                  className={clsx(
                    "grid min-h-[58px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors",
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
                    className="h-5 w-5 rounded-full border border-black/10"
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
          "flex h-14 shrink-0 items-center gap-2 border px-3 text-sm font-semibold transition sm:px-4",
          detailsOpen ? theme.controlShell : theme.previewStage,
          isDark ? "border-white/10" : "border-stone-200",
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
      className={clsx(
        "relative min-w-0 w-full max-w-full overflow-visible rounded-[8px] border px-2.5 py-2 sm:px-4",
        theme.previewStage,
        isDark ? "border-white/10" : "border-stone-200",
      )}
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
        <span className={clsx("hidden text-[11px] uppercase tracking-[0.14em] sm:inline", theme.cardMuted)}>{t.selectedColor}</span>
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
      <label className={clsx("hidden shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] sm:inline", theme.cardMuted)} htmlFor={id}>
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

function chunkPalette<T>(items: T[], size: number) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
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
