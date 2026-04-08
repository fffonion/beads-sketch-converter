import * as Slider from "@radix-ui/react-slider";
import clsx from "clsx";
import {
  Eraser,
  Eye,
  EyeOff,
  PaintBucket,
  Pencil,
  Pipette,
  Redo2,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import type { Messages } from "../lib/i18n";
import type { EditableCell, NormalizedCropRect } from "../lib/mard";
import { getThemeClasses } from "../lib/theme";

type EditTool = "paint" | "erase" | "pick" | "fill";

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
}) {
  const theme = getThemeClasses(isDark);

  const tools: Array<{
    id: EditTool;
    label: string;
    icon: typeof Pencil;
  }> = [
    { id: "paint", label: t.toolPaint, icon: Pencil },
    { id: "erase", label: t.toolErase, icon: Eraser },
    { id: "pick", label: t.toolPick, icon: Pipette },
    { id: "fill", label: t.toolFill, icon: PaintBucket },
  ];

  return (
    <section className={clsx("rounded-[14px] border p-3 backdrop-blur transition-colors sm:rounded-[16px] sm:p-4 xl:rounded-[18px]", theme.panel)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.editorTitle}</p>
          <p className={clsx("text-xs", theme.cardMuted)}>{t.editorSubtitle}</p>
        </div>
        <p className={clsx("text-xs", theme.cardMuted)}>{t.pixelEditorHint}</p>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[56px_minmax(0,1fr)]">
        <section className={clsx("rounded-[10px] border p-2 transition-colors xl:min-h-[520px]", theme.card)}>
          <div className="flex flex-col gap-2">
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

        <section className={clsx("rounded-[10px] border p-3 transition-colors sm:p-4 xl:min-h-[520px]", theme.card)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={clsx("text-xs uppercase tracking-[0.18em]", theme.cardMuted)}>{t.editorStage}</p>
              <p className={clsx("mt-1 text-xs", theme.cardMuted)}>
                {gridWidth} x {gridHeight}
              </p>
            </div>
            <ContextToolStrip
              t={t}
              isDark={isDark}
              editTool={editTool}
              selectedLabel={selectedLabel}
              selectedHex={selectedHex}
              paletteOptions={paletteOptions}
              brushSize={brushSize}
              onBrushSizeChange={onBrushSizeChange}
              fillTolerance={fillTolerance}
              onFillToleranceChange={onFillToleranceChange}
              onEditToolChange={onEditToolChange}
              onSelectedLabelChange={onSelectedLabelChange}
            />
          </div>

          <EditorStage
            cells={cells}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            inputUrl={inputUrl}
            overlayCropRect={overlayCropRect}
            overlayEnabled={overlayEnabled}
            isDark={isDark}
            onApplyCell={onApplyCell}
            paintActiveRef={paintActiveRef}
          />
        </section>
      </div>
    </section>
  );
}

function ContextToolStrip({
  t,
  isDark,
  editTool,
  selectedLabel,
  selectedHex,
  paletteOptions,
  brushSize,
  onBrushSizeChange,
  fillTolerance,
  onFillToleranceChange,
  onEditToolChange,
  onSelectedLabelChange,
}: {
  t: Messages;
  isDark: boolean;
  editTool: EditTool;
  selectedLabel: string;
  selectedHex: string | null;
  paletteOptions: Array<{ label: string; hex: string }>;
  brushSize: number;
  onBrushSizeChange: (value: number) => void;
  fillTolerance: number;
  onFillToleranceChange: (value: number) => void;
  onEditToolChange: (tool: EditTool) => void;
  onSelectedLabelChange: (label: string) => void;
}) {
  const theme = getThemeClasses(isDark);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [popupStyle, setPopupStyle] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const showPalette = editTool === "paint" || editTool === "fill";
  const showBrushSize = editTool === "paint" || editTool === "erase";
  const showFillThreshold = editTool === "fill";
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
      if (!triggerRef.current) {
        return;
      }

      const rect = triggerRef.current.getBoundingClientRect();
      const width = Math.min(460, Math.max(280, Math.min(window.innerWidth - 24, Math.floor(window.innerWidth * 0.34))));
      const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
      const maxHeight = Math.min(560, Math.max(320, Math.floor(window.innerHeight * 0.62)));
      const preferredTop = rect.bottom + 10;
      const top =
        preferredTop + maxHeight <= window.innerHeight - 12
          ? preferredTop
          : Math.max(12, rect.top - maxHeight - 10);
      const height = Math.max(300, Math.min(maxHeight, window.innerHeight - top - 12));
      setPopupStyle({ top, left, width, height });
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
    window.addEventListener("scroll", syncPopupPosition, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", syncPopupPosition);
      window.removeEventListener("scroll", syncPopupPosition, true);
    };
  }, [pickerOpen]);

  return (
    <div className={clsx("min-w-0 flex-1 rounded-[8px] border px-3 py-2 sm:px-4", theme.previewStage)}>
      <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
        {showPalette ? (
          <ColorPickerPopup
            t={t}
            isDark={isDark}
            selectedLabel={selectedLabel}
            selectedHex={selectedHex}
            filterText={filterText}
            options={filteredPaletteOptions}
            onFilterTextChange={setFilterText}
            onSelectLabel={(label) => {
              onEditToolChange(editTool === "fill" ? "fill" : "paint");
              onSelectedLabelChange(label);
              setPickerOpen(false);
            }}
            open={pickerOpen}
            popupStyle={popupStyle}
            popupRef={popupRef}
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
        <span className={clsx("shrink-0 text-xs", theme.cardMuted)}>{t.paletteHint}</span>
      </div>
    </div>
  );
}

function ColorPickerPopup({
  t,
  isDark,
  selectedLabel,
  selectedHex,
  filterText,
  options,
  onFilterTextChange,
  onSelectLabel,
  open,
  popupStyle,
  popupRef,
  triggerRef,
  setOpen,
}: {
  t: Messages;
  isDark: boolean;
  selectedLabel: string;
  selectedHex: string | null;
  filterText: string;
  options: Array<{ label: string; hex: string | null }>;
  onFilterTextChange: (value: string) => void;
  onSelectLabel: (label: string) => void;
  open: boolean;
  popupStyle: { top: number; left: number; width: number; height: number } | null;
  popupRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  setOpen: (value: boolean) => void;
}) {
  const theme = getThemeClasses(isDark);
  const popupInnerHeight = useMemo(() => {
    if (!popupStyle) {
      return 320;
    }
    return Math.max(200, popupStyle.height - 88);
  }, [popupStyle]);
  const honeycombLayout = useMemo(
    () => buildHoneycombLayout(options, popupStyle?.width ?? 420, popupInnerHeight),
    [options, popupInnerHeight, popupStyle?.width],
  );

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
        <span className={clsx("text-[11px] uppercase tracking-[0.14em]", theme.cardMuted)}>{t.selectedColor}</span>
        <span className={clsx("text-sm font-semibold", theme.cardTitle)}>{selectedLabel}</span>
      </button>

      {open && popupStyle ? (
        <div
          ref={popupRef}
          className={clsx("fixed z-[80] flex flex-col overflow-hidden rounded-[10px] border p-4 shadow-2xl", theme.controlShell)}
          style={{
            top: `${popupStyle.top}px`,
            left: `${popupStyle.left}px`,
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
      ) : null}
    </div>
  );
}

function EditorStage({
  cells,
  gridWidth,
  gridHeight,
  inputUrl,
  overlayCropRect,
  overlayEnabled,
  isDark,
  onApplyCell,
  paintActiveRef,
}: {
  cells: EditableCell[];
  gridWidth: number;
  gridHeight: number;
  inputUrl: string | null;
  overlayCropRect: NormalizedCropRect | null;
  overlayEnabled: boolean;
  isDark: boolean;
  onApplyCell: (index: number) => void;
  paintActiveRef: MutableRefObject<boolean>;
}) {
  const theme = getThemeClasses(isDark);
  const stageViewportRef = useRef<HTMLDivElement | null>(null);
  const [stageViewport, setStageViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    function syncViewport() {
      if (!stageViewportRef.current) {
        return;
      }

      const rect = stageViewportRef.current.getBoundingClientRect();
      const width = Math.max(0, rect.width - 24);
      const height = Math.max(0, window.innerHeight - rect.top - 36);
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
  }, []);

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
  const scaledStageWidth = stageWidth * stageScale;
  const scaledStageHeight = stageHeight * stageScale;

  return (
    <div
      ref={stageViewportRef}
      className={clsx("mt-4 overflow-hidden rounded-[10px] border p-2 sm:p-3", theme.previewStage)}
    >
      <div className="flex justify-center">
        <div
          className="relative overflow-hidden rounded-[8px]"
          style={{ width: `${scaledStageWidth}px`, height: `${scaledStageHeight}px` }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: `${stageWidth}px`,
              height: `${stageHeight}px`,
              transform: `scale(${stageScale})`,
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
                  className="relative border-0 p-0"
                  style={{
                    width: `${cellSize}px`,
                    height: `${cellSize}px`,
                    backgroundColor: cell.hex ?? (isDark ? "rgba(29,20,16,0.55)" : "rgba(247,244,238,0.65)"),
                  }}
                  onMouseDown={() => {
                    paintActiveRef.current = true;
                    onApplyCell(index);
                  }}
                  onPointerDown={() => {
                    paintActiveRef.current = true;
                    onApplyCell(index);
                  }}
                  onMouseEnter={(event) => {
                    if ((event.buttons & 1) === 1 && paintActiveRef.current) {
                      onApplyCell(index);
                    }
                  }}
                  onPointerEnter={(event) => {
                    if ((event.buttons & 1) === 1 && paintActiveRef.current) {
                      onApplyCell(index);
                    }
                  }}
                  type="button"
                >
                  {cell.label && cellSize >= 18 ? (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[8px] font-bold text-black/65 mix-blend-multiply sm:text-[9px]">
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
  );
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
    <div className={clsx("flex min-w-[210px] shrink-0 items-center gap-3 rounded-md border px-3 py-2", theme.pill)}>
      <label className={clsx("shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em]", theme.cardMuted)} htmlFor={id}>
          {label}
      </label>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Slider.Root
          id={id}
          className="relative flex h-5 min-w-[120px] flex-1 touch-none select-none items-center"
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
        <span className={clsx("w-8 shrink-0 text-right text-sm font-semibold", theme.cardTitle)}>{value}</span>
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
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition",
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
