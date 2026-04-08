import * as Tabs from "@radix-ui/react-tabs";
import * as Slider from "@radix-ui/react-slider";
import clsx from "clsx";
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
import type { Messages } from "../lib/i18n";
import type { EditableCell, NormalizedCropRect } from "../lib/mard";
import { getThemeClasses } from "../lib/theme";

type EditTool = "paint" | "erase" | "pick" | "fill" | "pan" | "zoom";
export type EditorPanelMode = "edit" | "pindou";

export function PixelEditorPanel({
  t,
  isDark,
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
  pindouFlipHorizontal,
  onPindouFlipHorizontalChange,
  pindouZoom,
  onPindouZoomChange,
}: {
  t: Messages;
  isDark: boolean;
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
  pindouFlipHorizontal: boolean;
  onPindouFlipHorizontalChange: (value: boolean) => void;
  pindouZoom: number;
  onPindouZoomChange: (value: number) => void;
}) {
  const theme = getThemeClasses(isDark);
  const flipHorizontalLabel = t.pindouFlipHorizontal ?? "Flip Horizontally";
  const panLabel = t.toolPan ?? "平移";
  const zoomLabel = t.toolZoom ?? "缩放";
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

      const top = panelBodyRef.current.getBoundingClientRect().top;
      const nextHeight = Math.max(420, Math.round(window.innerHeight - top - 24));
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
        style={panelViewportHeight > 0 ? { height: `${panelViewportHeight}px` } : undefined}
      >
        <Tabs.Content value="edit" className="mt-4 flex min-h-0 flex-1">
          <div className="grid h-full min-w-0 flex-1 items-stretch gap-3 xl:grid-cols-[56px_minmax(0,1fr)] xl:gap-4">
            <section className={clsx("min-h-0 min-w-0 rounded-[10px] border p-2 transition-colors", theme.card)}>
              <div className="flex w-full gap-2 overflow-x-auto xl:flex-col xl:overflow-visible">
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
            </section>

            <section className={clsx("flex min-h-0 min-w-0 flex-col rounded-[10px] border p-3 transition-colors sm:p-4", theme.card)}>
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

              <EditorStage
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
              />

              <EditResultSummary
                t={t}
                isDark={isDark}
                resultUrl={resultUrl}
                resultFileName={resultFileName}
                matchedColors={matchedColors}
                disabledResultLabels={disabledResultLabels}
                matchedCoveragePercent={matchedCoveragePercent}
                activeMatchedColorCount={activeMatchedColorCount}
                onMatchedCoveragePercentChange={onMatchedCoveragePercentChange}
                onToggleMatchedColor={onToggleMatchedColor}
              />
            </section>
          </div>
        </Tabs.Content>

        <Tabs.Content value="pindou" className="mt-4 flex min-h-0 w-full flex-1">
          <PindouModePanel
            t={t}
            isDark={isDark}
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
          <div className={clsx("pointer-events-auto flex items-center gap-1 rounded-md border px-1 py-1 shadow-sm backdrop-blur", theme.pill)}>
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
            <div className={clsx("flex items-center gap-1 rounded-md border px-1 py-1", theme.pill)}>
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
              <span>{flipHorizontalLabel}</span>
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

        <EditorStage
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
  resultUrl,
  resultFileName,
  matchedColors,
  disabledResultLabels,
  matchedCoveragePercent,
  activeMatchedColorCount,
  onMatchedCoveragePercentChange,
  onToggleMatchedColor,
}: {
  t: Messages;
  isDark: boolean;
  resultUrl: string;
  resultFileName: string;
  matchedColors: Array<{ label: string; count: number; hex: string }>;
  disabledResultLabels: string[];
  matchedCoveragePercent: number;
  activeMatchedColorCount: number;
  onMatchedCoveragePercentChange: (value: number) => void;
  onToggleMatchedColor: (label: string) => void;
}) {
  const theme = getThemeClasses(isDark);

  return (
    <section
      className={clsx(
        "mt-4 shrink-0 space-y-4 border-t pt-4",
        isDark ? "border-stone-700/70" : "border-stone-200/90",
      )}
    >
      <div className={clsx("rounded-[10px] border p-4 transition-colors sm:rounded-[12px]", theme.pill)}>
        <div className="flex items-center gap-3">
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
        <div className="mt-4 flex max-h-[240px] flex-wrap gap-2 overflow-auto pr-1">
          {matchedColors.map((color) => (
            <button
              key={color.label}
              className={clsx("flex items-center gap-3 rounded-md border px-3 py-2 transition-colors", theme.card)}
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
        <p className={clsx("mt-3 text-xs", theme.cardMuted)}>{t.matchedColorsHint}</p>
      </div>
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
    const source = [{ label: "H2", hex: null }, ...paletteOptions];
    if (!query) {
      return source;
    }
    return source.filter((option) => option.label.toUpperCase().includes(query));
  }, [filterText, paletteOptions]);

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
      className={clsx(
        "relative min-w-0 w-full max-w-full overflow-visible rounded-[8px] border px-2.5 py-2 sm:px-4",
        theme.previewStage,
        isDark ? "border-white/10" : "border-stone-200",
      )}
    >
      <div
        ref={rowRef}
        className="flex min-h-10 min-w-0 items-center gap-2 overflow-x-auto overflow-y-visible"
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
          <div className={clsx("flex items-center gap-1 rounded-md border px-1 py-1", theme.pill)}>
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
        <span className={clsx("hidden shrink-0 text-xs xl:inline", theme.cardMuted)}>{t.paletteHint}</span>
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
        <span className={clsx("text-sm font-semibold", theme.cardTitle)}>{selectedLabel}</span>
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
  options: Array<{ label: string; hex: string | null }>;
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

function EditorStage({
  cells,
  gridWidth,
  gridHeight,
  emptyPixelLabel,
  inputUrl,
  overlayCropRect,
  overlayEnabled,
  isDark,
  stageMode,
  editTool = "paint",
  brushSize = 1,
  selectedHex = null,
  focusedLabel,
  onFocusLabelChange,
  onApplyCell,
  paintActiveRef,
  focusOnly = false,
  flipHorizontal = false,
  editZoom = 1,
  onEditZoomChange,
  pindouZoom = 1,
  onPindouZoomChange,
}: {
  cells: EditableCell[];
  gridWidth: number;
  gridHeight: number;
  emptyPixelLabel: string;
  inputUrl: string | null;
  overlayCropRect: NormalizedCropRect | null;
  overlayEnabled: boolean;
  isDark: boolean;
  stageMode: EditorPanelMode;
  editTool?: EditTool;
  brushSize?: number;
  selectedHex?: string | null;
  focusedLabel?: string | null;
  onFocusLabelChange?: (label: string | null) => void;
  onApplyCell?: (index: number) => void;
  paintActiveRef: MutableRefObject<boolean>;
  focusOnly?: boolean;
  flipHorizontal?: boolean;
  editZoom?: number;
  onEditZoomChange?: (value: number) => void;
  pindouZoom?: number;
  onPindouZoomChange?: (value: number) => void;
}) {
  const theme = getThemeClasses(isDark);
  const stageViewportRef = useRef<HTMLDivElement | null>(null);
  const [stageViewport, setStageViewport] = useState({ width: 0, height: 0 });
  const pinchStateRef = useRef<{ distance: number; zoom: number } | null>(null);
  const touchPanStateRef = useRef<{
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
    moved: boolean;
    cellIndex: number | null;
  } | null>(null);
  const panStateRef = useRef<{
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
    moved: boolean;
    cellIndex: number | null;
  } | null>(null);
  const suppressTapUntilRef = useRef(0);
  const [isPanning, setIsPanning] = useState(false);
  const [cursorPreview, setCursorPreview] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });
  const [hoveredCellIndex, setHoveredCellIndex] = useState<number | null>(null);
  const stageInset = typeof window !== "undefined" && window.innerWidth < 640 ? 16 : 24;

  useEffect(() => {
    function syncViewport() {
      if (!stageViewportRef.current) {
        return;
      }

      const width = Math.max(0, stageViewportRef.current.clientWidth - stageInset);
      const height = Math.max(0, stageViewportRef.current.clientHeight - stageInset);
      setStageViewport((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    }

    syncViewport();
    const observer = new ResizeObserver(() => syncViewport());
    if (stageViewportRef.current) {
      observer.observe(stageViewportRef.current);
    }
    window.addEventListener("resize", syncViewport);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncViewport);
    };
  }, [focusOnly, stageInset]);

  const cellSize = calculateStageCellSize(
    gridWidth,
    gridHeight,
    stageViewport.width,
    stageViewport.height,
  );
  const gridGap = 1;
  const stageWidth = gridWidth * cellSize + Math.max(0, gridWidth - 1) * gridGap;
  const stageHeight = gridHeight * cellSize + Math.max(0, gridHeight - 1) * gridGap;
  const stageScale = calculateStageScale(
    stageWidth,
    stageHeight,
    stageViewport.width,
    stageViewport.height,
  );
  const baseScaledStageWidth = stageWidth * stageScale;
  const effectiveScale =
    stageMode === "pindou"
      ? stageScale * pindouZoom
      : stageScale * editZoom;
  const scaledStageWidth = stageWidth * effectiveScale;
  const scaledStageHeight = stageHeight * effectiveScale;
  const axisGutter = stageMode === "pindou" ? Math.max(22, Math.round(26 * stageScale)) : 0;
  const topGutter = stageMode === "pindou" ? axisGutter : 0;
  const leftGutter = stageMode === "pindou" ? axisGutter : 0;
  const totalStageWidth = scaledStageWidth + leftGutter;
  const totalStageHeight = scaledStageHeight + topGutter;
  const showBrushCursor = stageMode === "edit" && (editTool === "paint" || editTool === "erase");
  const showPickCursor = stageMode === "edit" && editTool === "pick";
  const brushPreviewSize = Math.max(
    18,
    Math.round(brushSize * (cellSize + gridGap) * effectiveScale + 10),
  );
  const viewportHeightForOverflow = stageViewport.height;
  const canPanStage =
    (stageMode === "pindou" || stageMode === "edit") &&
    (totalStageWidth > stageViewport.width + 2 || totalStageHeight > viewportHeightForOverflow + 2);
  const panToolActive = stageMode === "edit" && editTool === "pan";
  const zoomToolActive = stageMode === "edit" && editTool === "zoom";
  const hoveredCell =
    hoveredCellIndex === null
      ? null
      : cells[hoveredCellIndex] ?? null;
  const pickPreviewHex =
    hoveredCell?.hex ?? (isDark ? "#1C1712" : "#F7F4EE");
  const pickPreviewLabel = hoveredCell?.label ?? emptyPixelLabel;
  const pickPreviewTextColor = chooseCursorTextColor(pickPreviewHex);

  useEffect(() => {
    if ((stageMode !== "pindou" && stageMode !== "edit") || !stageViewportRef.current) {
      return;
    }

    const element = stageViewportRef.current;

    function getTouchDistance(touches: TouchList) {
      if (touches.length < 2) {
        return null;
      }
      const first = touches[0];
      const second = touches[1];
      return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
    }

    function clearTouchPan() {
      touchPanStateRef.current = null;
      setIsPanning(false);
    }

    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length === 1) {
        pinchStateRef.current = null;
        if (!canPanStage || (stageMode === "edit" && !panToolActive)) {
          clearTouchPan();
          return;
        }

        const touch = event.touches[0];
        touchPanStateRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          startScrollLeft: element.scrollLeft,
          startScrollTop: element.scrollTop,
          moved: false,
          cellIndex: getCellIndexFromTarget(event.target),
        };
        return;
      }

      clearTouchPan();
      panStateRef.current = null;
      setIsPanning(false);
      const distance = getTouchDistance(event.touches);
      if (!distance) {
        return;
      }
      pinchStateRef.current = {
        distance,
        zoom: stageMode === "pindou" ? pindouZoom : editZoom,
      };
    }

    function handleTouchMove(event: TouchEvent) {
      if (event.touches.length === 1 && touchPanStateRef.current) {
        const touch = event.touches[0];
        const state = touchPanStateRef.current;
        const deltaX = touch.clientX - state.startX;
        const deltaY = touch.clientY - state.startY;
        if (!state.moved && Math.hypot(deltaX, deltaY) < 4) {
          return;
        }

        if (!state.moved) {
          state.moved = true;
          setIsPanning(true);
        }

        event.preventDefault();
        element.scrollLeft = state.startScrollLeft - deltaX;
        element.scrollTop = state.startScrollTop - deltaY;
        return;
      }

      if (event.touches.length < 2 || !pinchStateRef.current) {
        return;
      }

      const distance = getTouchDistance(event.touches);
      if (!distance) {
        return;
      }

      event.preventDefault();
      const nextZoom = (pinchStateRef.current.zoom * distance) / pinchStateRef.current.distance;
      if (stageMode === "pindou") {
        onPindouZoomChange?.(clampPindouZoom(nextZoom));
      } else {
        onEditZoomChange?.(clampEditorZoom(nextZoom));
      }
    }

    function handleTouchEnd(event: TouchEvent) {
      const touchPanState = touchPanStateRef.current;
      if (touchPanState && event.touches.length === 0) {
        if (
          stageMode === "pindou" &&
          !touchPanState.moved &&
          touchPanState.cellIndex !== null &&
          suppressTapUntilRef.current <= performance.now()
        ) {
          const cell = cells[touchPanState.cellIndex] ?? null;
          onFocusLabelChange?.(cell?.label && cell.label === focusedLabel ? null : cell?.label ?? null);
        }

        if (touchPanState.moved) {
          suppressTapUntilRef.current = performance.now() + 180;
        }

        clearTouchPan();
      }

      if (event.touches.length < 2) {
        pinchStateRef.current = null;
      }
    }

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", handleTouchEnd);
    element.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchEnd);
      clearTouchPan();
    };
  }, [stageMode, canPanStage, panToolActive, pindouZoom, onPindouZoomChange, editZoom, onEditZoomChange, cells, focusedLabel, onFocusLabelChange]);

  useEffect(() => {
    if (stageMode !== "pindou" || !stageViewportRef.current) {
      return;
    }

    const element = stageViewportRef.current;

    function handleWheel(event: WheelEvent) {
      if (!onPindouZoomChange) {
        return;
      }

      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.12 : -0.12;
      onPindouZoomChange(clampPindouZoom(pindouZoom + delta));
    }

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", handleWheel);
    };
  }, [stageMode, pindouZoom, onPindouZoomChange]);

  useEffect(() => {
    if (!canPanStage || !stageViewportRef.current) {
      setIsPanning(false);
      panStateRef.current = null;
      return;
    }

    const element = stageViewportRef.current;

    function clearPan(pointerId?: number) {
      if (pointerId !== undefined && element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
      panStateRef.current = null;
      setIsPanning(false);
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      if (stageMode === "edit" && !panToolActive) {
        return;
      }

      panStateRef.current = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        startScrollLeft: element.scrollLeft,
        startScrollTop: element.scrollTop,
        moved: false,
        cellIndex: Number.isNaN(
          Number.parseInt(
            (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-cell-index]")?.dataset.cellIndex ?? "",
            10,
          ),
        )
          ? null
          : Number.parseInt(
              (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-cell-index]")?.dataset.cellIndex ?? "",
              10,
            ),
      };
      element.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event: PointerEvent) {
      const state = panStateRef.current;
      if (!state || state.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      if (!state.moved && Math.hypot(deltaX, deltaY) < 4) {
        return;
      }

      if (!state.moved) {
        state.moved = true;
        setIsPanning(true);
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      element.scrollLeft = state.startScrollLeft - deltaX;
      element.scrollTop = state.startScrollTop - deltaY;
    }

    function handlePointerEnd(event: PointerEvent) {
      const state = panStateRef.current;
      if (!state || state.pointerId !== event.pointerId) {
        return;
      }

      if (
        stageMode === "pindou" &&
        !state.moved &&
        state.cellIndex !== null &&
        suppressTapUntilRef.current <= performance.now()
      ) {
        const cell = cells[state.cellIndex] ?? null;
        onFocusLabelChange?.(cell?.label && cell.label === focusedLabel ? null : cell?.label ?? null);
      }

      if (state.moved) {
        suppressTapUntilRef.current = performance.now() + 180;
      }

      clearPan(event.pointerId);
    }

    element.addEventListener("pointerdown", handlePointerDown);
    element.addEventListener("pointermove", handlePointerMove);
    element.addEventListener("pointerup", handlePointerEnd);
    element.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      element.removeEventListener("pointerdown", handlePointerDown);
      element.removeEventListener("pointermove", handlePointerMove);
      element.removeEventListener("pointerup", handlePointerEnd);
      element.removeEventListener("pointercancel", handlePointerEnd);
      clearPan();
    };
  }, [canPanStage, panToolActive, stageMode, cells, focusedLabel, onFocusLabelChange]);

  return (
    <div
      ref={stageViewportRef}
      className={clsx(
        "relative mt-4 flex min-h-0 w-full min-w-0 max-w-full flex-1 rounded-[10px] border p-2 sm:p-3",
        canPanStage ? "overflow-auto" : "overflow-hidden",
        showBrushCursor || showPickCursor ? "cursor-none" : "",
        zoomToolActive ? "cursor-zoom-in" : "",
        canPanStage && (stageMode === "pindou" || panToolActive)
          ? (isPanning ? "cursor-grabbing select-none" : "cursor-grab")
          : "",
        "min-h-0",
        theme.previewStage,
        isDark ? "border-white/10" : "border-stone-200",
      )}
      onPointerEnter={(event) => {
        if (!showBrushCursor && !showPickCursor) {
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        setCursorPreview({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          visible: true,
        });
      }}
      onPointerMove={(event) => {
        if (!showBrushCursor && !showPickCursor) {
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        setCursorPreview({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          visible: true,
        });
      }}
      onPointerLeave={() => {
        if (!showBrushCursor && !showPickCursor) {
          setHoveredCellIndex(null);
          return;
        }
        setHoveredCellIndex(null);
        setCursorPreview((previous) => ({ ...previous, visible: false }));
      }}
    >
      <CanvasStatusBadge
        gridWidth={gridWidth}
        gridHeight={gridHeight}
        hoveredCellIndex={hoveredCellIndex}
        isDark={isDark}
      />
      {showBrushCursor && cursorPreview.visible ? (
        <div
          className="pointer-events-none absolute z-40 flex items-center justify-center"
          style={{
            left: `${cursorPreview.x}px`,
            top: `${cursorPreview.y}px`,
            width: `${brushPreviewSize}px`,
            height: `${brushPreviewSize}px`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div
            className="flex h-full w-full items-center justify-center rounded-full border shadow-sm backdrop-blur-[1px]"
            style={{
              borderColor:
                editTool === "erase"
                  ? isDark
                    ? "rgba(255,255,255,0.85)"
                    : "rgba(17,17,17,0.82)"
                  : selectedHex ?? (isDark ? "#F7F4EE" : "#111111"),
              backgroundColor:
                editTool === "erase"
                  ? isDark
                    ? "rgba(30,30,30,0.44)"
                    : "rgba(255,255,255,0.7)"
                  : selectedHex
                    ? `${selectedHex}22`
                    : isDark
                      ? "rgba(247,244,238,0.16)"
                      : "rgba(17,17,17,0.08)",
            }}
          >
            {editTool === "erase" ? (
              <Eraser className="h-3.5 w-3.5" />
            ) : (
              <Pencil className="h-3.5 w-3.5" />
            )}
          </div>
        </div>
      ) : null}
      {showPickCursor && cursorPreview.visible ? (
        <div
          className="pointer-events-none absolute z-40"
          style={{
            left: `${cursorPreview.x + 14}px`,
            top: `${cursorPreview.y + 14}px`,
            transform: "translate(0, 0)",
          }}
        >
          <div
            className={clsx(
              "flex items-center gap-2 rounded-md border px-2 py-1.5 shadow-sm backdrop-blur-sm",
              isDark ? "border-white/10 bg-stone-950/88" : "border-stone-300 bg-white/92",
            )}
          >
            <div
              className="h-4 w-4 shrink-0 rounded-[4px] border"
              style={{
                backgroundColor: pickPreviewHex,
                borderColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(17,17,17,0.14)",
              }}
            />
            <div className="flex items-center gap-1.5">
              <Pipette className="h-3.5 w-3.5 shrink-0" style={{ color: pickPreviewTextColor }} />
              <span
                className="max-w-[120px] truncate text-xs font-semibold"
                style={{ color: pickPreviewTextColor }}
              >
                {pickPreviewLabel}
              </span>
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex min-h-full min-w-full items-center justify-center">
        <div
          className="relative w-fit max-w-full shrink-0"
          style={{
            width: `${totalStageWidth}px`,
            height: `${totalStageHeight}px`,
          }}
        >
          {stageMode === "pindou" ? (
            <>
              <div
                className="absolute left-0 top-0"
                style={{
                  width: `${leftGutter}px`,
                  height: `${topGutter}px`,
                }}
              />
              <AxisLabels
                axis="x"
                gridCount={gridWidth}
                offset={leftGutter}
                gutter={topGutter}
                stageScale={stageScale}
                stageLength={scaledStageWidth}
                isDark={isDark}
              />
              <AxisLabels
                axis="y"
                gridCount={gridHeight}
                offset={topGutter}
                gutter={leftGutter}
                stageScale={stageScale}
                stageLength={scaledStageHeight}
                isDark={isDark}
              />
            </>
          ) : null}

          <div
            className="absolute overflow-hidden rounded-[8px]"
            style={{
              left: `${leftGutter}px`,
              top: `${topGutter}px`,
              width: `${scaledStageWidth}px`,
              height: `${scaledStageHeight}px`,
            }}
          >
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: `${stageWidth}px`,
                height: `${stageHeight}px`,
                transform: `scale(${effectiveScale})`,
              }}
            >
              {overlayEnabled && inputUrl ? (
                <img
                  className="pointer-events-none absolute inset-0 z-20 h-full w-full object-cover"
                  src={inputUrl}
                  alt=""
                  style={buildOverlayImageStyle(overlayCropRect)}
                />
              ) : null}

              {stageMode === "pindou" ? (
                <PindouGuideLines
                  gridWidth={gridWidth}
                  gridHeight={gridHeight}
                  cellSize={cellSize}
                  gridGap={gridGap}
                />
              ) : null}

              <div
                className="absolute inset-0 z-10 grid gap-px"
                style={{
                  gridTemplateColumns: `repeat(${gridWidth}, minmax(${cellSize}px, ${cellSize}px))`,
                  gridTemplateRows: `repeat(${gridHeight}, minmax(${cellSize}px, ${cellSize}px))`,
                  backgroundColor: isDark ? "#3a3128" : "#c9c4bc",
                }}
              >
                {cells.map((cell, index) => (
                  <button
                    key={index}
                    data-cell-index={index}
                    className={clsx(
                      "relative border-0 p-0",
                      showBrushCursor || showPickCursor ? "cursor-none" : "",
                    )}
                    style={{
                      width: `${cellSize}px`,
                      height: `${cellSize}px`,
                      gridColumnStart: flipHorizontal
                        ? gridWidth - (index % gridWidth)
                        : (index % gridWidth) + 1,
                      gridRowStart: Math.floor(index / gridWidth) + 1,
                      backgroundColor: getStageCellBackgroundColor(cell, stageMode, focusedLabel, isDark),
                      boxShadow: getStageCellHighlight(cell, stageMode, focusedLabel, isDark),
                    }}
                    onMouseDown={() => {
                      if (stageMode !== "edit") {
                        return;
                      }
                      setHoveredCellIndex(index);
                      paintActiveRef.current = true;
                      onApplyCell?.(index);
                    }}
                    onPointerDown={(event) => {
                      setHoveredCellIndex(index);
                      if (stageMode === "pindou") {
                        return;
                      }
                      if (editTool === "zoom") {
                        const shouldZoomOut = event.button === 2 || event.shiftKey;
                        onEditZoomChange?.(
                          clampEditorZoom(editZoom + (shouldZoomOut ? -0.2 : 0.2)),
                        );
                        return;
                      }
                      if (editTool === "pan") {
                        return;
                      }
                      paintActiveRef.current = true;
                      onApplyCell?.(index);
                    }}
                    onContextMenu={(event) => {
                      if (stageMode === "edit" && editTool === "zoom") {
                        event.preventDefault();
                      }
                    }}
                    onMouseEnter={(event) => {
                      setHoveredCellIndex(index);
                      if (stageMode !== "edit") {
                        return;
                      }
                      if (editTool === "pan" || editTool === "zoom") {
                        return;
                      }
                      if ((event.buttons & 1) === 1 && paintActiveRef.current) {
                        onApplyCell?.(index);
                      }
                    }}
                    onPointerEnter={(event) => {
                      setHoveredCellIndex(index);
                      if (stageMode !== "edit") {
                        return;
                      }
                      if (editTool === "pan" || editTool === "zoom") {
                        return;
                      }
                      if ((event.buttons & 1) === 1 && paintActiveRef.current) {
                        onApplyCell?.(index);
                      }
                    }}
                    onPointerMove={() => setHoveredCellIndex(index)}
                    type="button"
                  >
                    {shouldShowStageCellLabel(cell, stageMode, focusedLabel, cellSize) ? (
                      <span
                        className="pointer-events-none absolute inset-0 flex items-center justify-center font-bold"
                        style={getStageCellLabelStyle(cell, stageMode, focusedLabel, isDark, cellSize)}
                      >
                        {cell.label}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AxisLabels({
  axis,
  gridCount,
  offset,
  gutter,
  stageScale,
  stageLength,
  isDark,
}: {
  axis: "x" | "y";
  gridCount: number;
  offset: number;
  gutter: number;
  stageScale: number;
  stageLength: number;
  isDark: boolean;
}) {
  const textColor = isDark ? "rgba(255,255,255,0.82)" : "rgba(17,17,17,0.78)";
  const fontSize = Math.max(9, Math.min(12, 10 * stageScale + 1));
  const labels = buildAxisLabelPositions(gridCount);

  return (
    <>
      {labels.map((label) => {
        const position = ((label.index + 0.5) / gridCount) * stageLength;
        return (
          <div
            key={`${axis}-${label.value}`}
            className="pointer-events-none absolute flex items-center justify-center font-semibold"
            style={
              axis === "x"
                ? {
                    left: `${offset + position}px`,
                    top: `${gutter * 0.12}px`,
                    width: `${Math.max(12, 18 * stageScale)}px`,
                    height: `${gutter * 0.76}px`,
                    transform: "translateX(-50%)",
                    color: textColor,
                    fontSize: `${fontSize}px`,
                  }
                : {
                    left: `${gutter * 0.08}px`,
                    top: `${offset + position}px`,
                    width: `${gutter * 0.76}px`,
                    height: `${Math.max(12, 18 * stageScale)}px`,
                    transform: "translateY(-50%)",
                    color: textColor,
                    fontSize: `${fontSize}px`,
                  }
            }
          >
            {label.value}
          </div>
        );
      })}
    </>
  );
}

function CanvasStatusBadge({
  gridWidth,
  gridHeight,
  hoveredCellIndex,
  isDark,
}: {
  gridWidth: number;
  gridHeight: number;
  hoveredCellIndex: number | null;
  isDark: boolean;
}) {
  const theme = getThemeClasses(isDark);
  const hoveredX = hoveredCellIndex === null ? "--" : String((hoveredCellIndex % gridWidth) + 1);
  const hoveredY =
    hoveredCellIndex === null ? "--" : String(Math.floor(hoveredCellIndex / gridWidth) + 1);

  return (
    <div
      className={clsx(
        "pointer-events-none absolute bottom-2 right-2 z-40 rounded-md px-2.5 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur-sm sm:text-xs",
        isDark ? "bg-stone-950/70 text-stone-100" : "bg-white/80 text-stone-700",
        theme.cardMuted,
      )}
    >
      {gridWidth} x {gridHeight} · {hoveredX}, {hoveredY}
    </div>
  );
}

function chooseCursorTextColor(hex: string) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return "#111111";
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  return luminance >= 160 ? "#111111" : "#FFFFFF";
}

function getCellIndexFromTarget(target: EventTarget | null) {
  const element =
    target instanceof HTMLElement
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;
  const raw = element?.closest<HTMLElement>("[data-cell-index]")?.dataset.cellIndex;
  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function PindouGuideLines({
  gridWidth,
  gridHeight,
  cellSize,
  gridGap,
}: {
  gridWidth: number;
  gridHeight: number;
  cellSize: number;
  gridGap: number;
}) {
  const pitch = cellSize + gridGap;
  const lines: Array<{
    key: string;
    orientation: "vertical" | "horizontal";
    position: number;
    dashed: boolean;
  }> = [];

  for (let index = 5; index < gridWidth; index += 5) {
    lines.push({
      key: `vx-${index}`,
      orientation: "vertical",
      position: index * pitch - gridGap / 2,
      dashed: index % 10 !== 0,
    });
  }

  for (let index = 5; index < gridHeight; index += 5) {
    lines.push({
      key: `hy-${index}`,
      orientation: "horizontal",
      position: index * pitch - gridGap / 2,
      dashed: index % 10 !== 0,
    });
  }

  return (
    <>
      {lines.map((line) => (
        <div
          key={line.key}
          className="pointer-events-none absolute z-30 bg-black"
          style={
            line.orientation === "vertical"
              ? {
                  left: `${line.position}px`,
                  top: 0,
                  width: "1.5px",
                  height: "100%",
                  opacity: line.dashed ? 0.9 : 1,
                  backgroundImage: line.dashed
                    ? "repeating-linear-gradient(to bottom, #000 0 7px, transparent 7px 11px)"
                    : "none",
                  backgroundColor: line.dashed ? "transparent" : "#000",
                }
              : {
                  top: `${line.position}px`,
                  left: 0,
                  height: "1.5px",
                  width: "100%",
                  opacity: line.dashed ? 0.9 : 1,
                  backgroundImage: line.dashed
                    ? "repeating-linear-gradient(to right, #000 0 7px, transparent 7px 11px)"
                    : "none",
                  backgroundColor: line.dashed ? "transparent" : "#000",
                }
          }
        />
      ))}
    </>
  );
}

function buildAxisLabelPositions(gridCount: number) {
  const labels: Array<{ index: number; value: number }> = [];
  for (let index = 0; index < gridCount; index += 1) {
    const value = index + 1;
    if (value === 1 || value % 5 === 0 || value === gridCount) {
      labels.push({ index, value });
    }
  }
  return labels;
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

function getStageCellBackgroundColor(
  cell: EditableCell,
  stageMode: EditorPanelMode,
  focusedLabel: string | null | undefined,
  isDark: boolean,
) {
  const emptyColor = isDark ? "rgba(29,20,16,0.55)" : "rgba(247,244,238,0.65)";
  if (stageMode !== "pindou" || !focusedLabel) {
    return cell.hex ?? emptyColor;
  }

  if (cell.label === focusedLabel && cell.hex) {
    return cell.hex;
  }

  if (cell.hex) {
    return blendHexWithWhite(cell.hex, 0.92);
  }

  return isDark ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.96)";
}

function getStageCellHighlight(
  cell: EditableCell,
  stageMode: EditorPanelMode,
  focusedLabel: string | null | undefined,
  isDark: boolean,
) {
  if (stageMode !== "pindou" || !focusedLabel || cell.label !== focusedLabel) {
    return "none";
  }

  return isDark
    ? "inset 0 0 0 2px rgba(255,255,255,0.9), 0 0 0 1px rgba(255,255,255,0.35)"
    : "inset 0 0 0 2px rgba(17,17,17,0.84), 0 0 0 1px rgba(17,17,17,0.18)";
}

function shouldShowStageCellLabel(
  cell: EditableCell,
  stageMode: EditorPanelMode,
  focusedLabel: string | null | undefined,
  _cellSize: number,
) {
  if (stageMode === "edit") {
    return false;
  }

  if (!cell.label) {
    return false;
  }

  if (!focusedLabel) {
    return true;
  }

  return cell.label === focusedLabel;
}

function getStageCellLabelStyle(
  cell: EditableCell,
  stageMode: EditorPanelMode,
  focusedLabel: string | null | undefined,
  isDark: boolean,
  cellSize: number,
) {
  const background = getStageCellBackgroundColor(cell, stageMode, focusedLabel, isDark);
  const useLightText = shouldUseLightText(background);
  const fontSize = Math.max(5, Math.min(10, Math.round(cellSize * 0.22)));
  return {
    color: useLightText ? "rgba(255,255,255,0.96)" : "rgba(17,17,17,0.92)",
    fontSize: `${fontSize}px`,
    lineHeight: 1,
    textShadow: useLightText
      ? "0 1px 1px rgba(0,0,0,0.42)"
      : "0 1px 1px rgba(255,255,255,0.35)",
  } as const;
}

function blendHexWithWhite(hex: string, ratio: number) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return hex;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const mix = (value: number) => Math.round(value + (255 - value) * ratio);
  return `rgb(${mix(red)}, ${mix(green)}, ${mix(blue)})`;
}

function shouldUseLightText(color: string) {
  const rgb = parseCssColor(color);
  if (!rgb) {
    return false;
  }

  const [red, green, blue] = rgb;
  const luminance =
    toLinearChannel(red / 255) * 0.2126 +
    toLinearChannel(green / 255) * 0.7152 +
    toLinearChannel(blue / 255) * 0.0722;
  return luminance < 0.42;
}

function parseCssColor(color: string): [number, number, number] | null {
  const normalized = color.trim();
  if (normalized.startsWith("#")) {
    const hex = normalized.slice(1);
    if (hex.length !== 6) {
      return null;
    }
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }

  const rgbMatch = normalized.match(/rgba?\(([^)]+)\)/i);
  if (!rgbMatch) {
    return null;
  }

  const parts = rgbMatch[1]
    .split(",")
    .slice(0, 3)
    .map((part) => Number.parseFloat(part.trim()));
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return [parts[0], parts[1], parts[2]];
}

function toLinearChannel(value: number) {
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
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
        disabled
          ? theme.disabledButton
          : active
            ? theme.controlButtonActive
            : theme.pill,
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

function buildOverlayImageStyle(
  cropRect: NormalizedCropRect | null,
) {
  if (!cropRect) {
    return { opacity: 1 };
  }

  return {
    opacity: 1,
    width: `${100 / cropRect.width}%`,
    height: `${100 / cropRect.height}%`,
    maxWidth: "none",
    left: `-${(cropRect.x / cropRect.width) * 100}%`,
    top: `-${(cropRect.y / cropRect.height) * 100}%`,
  } as const;
}

function chunkPalette<T>(items: T[], size: number) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

function buildHoneycombLayout(
  options: Array<{ label: string; hex: string | null }>,
  popupWidth: number,
  popupHeight: number,
) {
  if (!options.length) {
    return { width: 120, height: 100, cells: [] as Array<{ sourceLabel: string; label: string; hex: string | null; points: string }> };
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
  const centerOffsetX = paddingX + (-bounds.minX) * radius;
  const centerOffsetY = paddingY + (-bounds.minY) * radius;

  const cells = options.map((option, index) => {
    const position = positions[index];
    const [unitX, unitY] = axialToUnitPoint(position.q, position.r);
    const centerX = centerOffsetX + unitX * radius;
    const centerY = centerOffsetY + unitY * radius;
    return {
      sourceLabel: option.label,
      label: option.label === "H2" ? "H2" : option.label,
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
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
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
    const directions: Array<[number, number]> = [
      [-1, 1],
      [-1, 0],
      [0, -1],
      [1, -1],
      [1, 0],
      [0, 1],
    ];

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
  return [
    Math.sqrt(3) * (q + r / 2),
    1.5 * r,
  ] as const;
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

function calculateStageCellSize(
  gridWidth: number,
  gridHeight: number,
  availableWidth: number,
  availableHeight: number,
) {
  if (gridWidth <= 0 || gridHeight <= 0) {
    return 12;
  }

  const widthBound = availableWidth > 0 ? Math.floor(availableWidth / gridWidth) : 26;
  const heightBound = availableHeight > 0 ? Math.floor(availableHeight / gridHeight) : 26;
  const fitted = Math.min(widthBound, heightBound);
  return Math.max(4, Math.min(26, fitted || 26));
}

function calculateStageScale(
  stageWidth: number,
  stageHeight: number,
  availableWidth: number,
  availableHeight: number,
) {
  if (stageWidth <= 0 || stageHeight <= 0) {
    return 1;
  }

  const widthScale = availableWidth > 0 ? availableWidth / stageWidth : 1;
  const heightScale = availableHeight > 0 ? availableHeight / stageHeight : 1;
  return Math.max(0.1, Math.min(1, widthScale, heightScale));
}

function clampPindouZoom(value: number) {
  return Math.max(0.5, Math.min(4, Number(value.toFixed(2))));
}

function clampEditorZoom(value: number) {
  return Math.max(0.5, Math.min(6, Number(value.toFixed(2))));
}
