import * as Tabs from "@radix-ui/react-tabs";
import * as Label from "@radix-ui/react-label";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Messages } from "../lib/i18n";
import type { NormalizedCropRect } from "../lib/chart-processor";
import { getThemeClasses } from "../lib/theme";
import { CollapsibleSection, NumberSliderField, SliderRow, SwitchRow } from "./controls";
import { HoneycombColorGrid, type HoneycombColorOption } from "./pixel-editor-color-picker";
import { getPopoverViewportLayout } from "./popover-layout";
import { OriginalPreviewCard } from "./preview-cards";

type GridMode = "auto" | "manual";
const EDGE_COLOR_AUTO_LABEL = "__EDGE_COLOR_AUTO__";
const EDGE_COLOR_POPUP_PREFERRED_WIDTH = 296;
const EDGE_COLOR_POPUP_VIEWPORT_MARGIN = 12;
const EDGE_COLOR_POPUP_GAP = 8;
const EDGE_COLOR_POPUP_ESTIMATED_HEIGHT = 336;

export function shouldCloseEdgeColorPickerPopup(
  target: Node | null,
  anchor: Pick<Element, "contains"> | null,
  popup: Pick<Element, "contains"> | null,
) {
  if (!target) {
    return true;
  }

  return !anchor?.contains(target) && !popup?.contains(target);
}

export function SidebarPanel({
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
  busy,
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
  busy: boolean;
  isDark: boolean;
  gridMode: GridMode;
  onGridModeChange: (value: GridMode) => void;
  gridWidth: string;
  gridHeight: string;
  onGridWidthChange: (value: string) => void;
  onGridHeightChange: (value: string) => void;
  followSourceRatio: boolean;
  onFollowSourceRatioChange: (checked: boolean) => void;
  paletteOptions: Array<{ label: string; hex: string }>;
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
}) {
  const theme = getThemeClasses(isDark);
  const edgeColorPickerRef = useRef<HTMLDivElement | null>(null);
  const edgeColorPopupRef = useRef<HTMLDivElement | null>(null);
  const [collapsedSections, setCollapsedSections] = useState(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
    return {
      source: false,
      grid: isMobile,
    };
  });
  const [edgeColorPickerOpen, setEdgeColorPickerOpen] = useState(false);
  const [edgeColorPopupLayout, setEdgeColorPopupLayout] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const fftEdgeEnhanceOverrideOption =
    fftEdgeEnhanceOverrideLabel
      ? paletteOptions.find((entry) => entry.label === fftEdgeEnhanceOverrideLabel) ?? null
      : null;
  const edgeColorButtonTitle = fftEdgeEnhanceOverrideOption
    ? `${t.edgeColorOverride}: ${fftEdgeEnhanceOverrideOption.label}`
    : `${t.edgeColorOverride}: ${t.edgeColorAuto}`;
  const sortedEdgeColorPickerOptions = useMemo(
    () => [
      {
        label: EDGE_COLOR_AUTO_LABEL,
        displayLabel: t.edgeColorAuto,
        hex: null,
      },
      ...[...paletteOptions]
        .sort((left, right) => {
          const leftLuma = getRelativeLuminance(left.hex);
          const rightLuma = getRelativeLuminance(right.hex);
          if (leftLuma !== rightLuma) {
            return leftLuma - rightLuma;
          }
          return left.label.localeCompare(right.label);
        })
        .map((option) => ({
          label: option.label,
          displayLabel: option.label,
          hex: option.hex,
          radiusScale: option.label === "H6" ? 1.28 : 1,
        })),
    ],
    [paletteOptions, t.edgeColorAuto],
  );

  function toggleSection(section: keyof typeof collapsedSections) {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!edgeColorPickerOpen) {
      setEdgeColorPopupLayout(null);
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        shouldCloseEdgeColorPickerPopup(
          event.target as Node | null,
          edgeColorPickerRef.current,
          edgeColorPopupRef.current,
        )
      ) {
        setEdgeColorPickerOpen(false);
      }
    }

    function syncEdgeColorPopupLayout() {
      const anchor = edgeColorPickerRef.current;
      if (!anchor) {
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const popupHeight =
        edgeColorPopupRef.current?.getBoundingClientRect().height ??
        EDGE_COLOR_POPUP_ESTIMATED_HEIGHT;
      const viewportLayout = getPopoverViewportLayout({
        anchorRight: rect.right,
        preferredWidth: EDGE_COLOR_POPUP_PREFERRED_WIDTH,
        viewportWidth: window.innerWidth,
        viewportMargin: EDGE_COLOR_POPUP_VIEWPORT_MARGIN,
      });
      setEdgeColorPopupLayout({
        left: viewportLayout.left,
        top: Math.max(
          EDGE_COLOR_POPUP_VIEWPORT_MARGIN,
          rect.top - popupHeight - EDGE_COLOR_POPUP_GAP,
        ),
        width: viewportLayout.width,
      });
    }

    syncEdgeColorPopupLayout();
    const postRenderSync = window.requestAnimationFrame(syncEdgeColorPopupLayout);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", syncEdgeColorPopupLayout);
    window.addEventListener("scroll", syncEdgeColorPopupLayout, true);
    return () => {
      window.cancelAnimationFrame(postRenderSync);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", syncEdgeColorPopupLayout);
      window.removeEventListener("scroll", syncEdgeColorPopupLayout, true);
    };
  }, [edgeColorPickerOpen]);

  return (
    <section
      className={clsx(
        "scrollbar-none min-h-0 overflow-y-auto rounded-[14px] border pb-4 pl-4 pr-3 pt-4 backdrop-blur transition-colors sm:rounded-[16px] sm:pb-5 sm:pl-5 sm:pr-4 sm:pt-5 lg:h-full lg:self-start xl:rounded-[18px]",
        theme.panel,
      )}
    >
      <div className="space-y-5">
        <OriginalPreviewCard
          title=""
          file={file}
          url={inputUrl}
          busy={busy}
          emptyText={t.sourceEmpty}
          sourceChooseImage={t.sourceChooseImage}
          sourceFocusView={t.sourceFocusView}
          sourceExitFocus={t.sourceExitFocus}
          sourceBadge={sourceBadge}
          onFileSelection={onFileSelection}
          cropReset={t.cropReset}
          cropEdit={t.cropEdit}
          cropMode={cropMode}
          onCropModeChange={onCropModeChange}
          cropRect={cropRect}
          displayCropRect={displayCropRect}
          onCropChange={onCropChange}
          isDark={isDark}
          focusViewOpen={sourceFocusViewOpen}
          onFocusViewOpenChange={onSourceFocusViewOpenChange}
          collapsed={collapsedSections.source}
          onToggleCollapsed={() => toggleSection("source")}
        />

        <CollapsibleSection
          title={t.gridTitle}
          collapsed={collapsedSections.grid}
          onToggle={() => toggleSection("grid")}
          isDark={isDark}
        >
          <Tabs.Root className="mt-4" value={gridMode} onValueChange={(value) => onGridModeChange(value as GridMode)}>
            <Tabs.List className={clsx("grid grid-cols-2 rounded-lg p-1", theme.segmented)}>
              <Tabs.Trigger
                value="auto"
                className={clsx("rounded-md px-4 py-2 text-sm font-semibold outline-none transition", theme.segmentedTrigger)}
              >
                {t.gridAuto}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="manual"
                className={clsx("rounded-md px-4 py-2 text-sm font-semibold outline-none transition", theme.segmentedTrigger)}
              >
                {t.gridManual}
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="auto" className={clsx("mt-4 rounded-lg p-4 text-sm", theme.subtlePanel)}>
              {t.gridAutoDescription}
            </Tabs.Content>

            <Tabs.Content value="manual" className={clsx("mt-4 rounded-lg p-4", theme.subtlePanel)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberSliderField
                  id="grid-width"
                  label={t.gridWidth}
                  value={gridWidth}
                  onChange={onGridWidthChange}
                  min={1}
                  max={156}
                  isDark={isDark}
                  mobileSliderOnly
                />
                <NumberSliderField
                  id="grid-height"
                  label={t.gridHeight}
                  value={gridHeight}
                  onChange={onGridHeightChange}
                  min={1}
                  max={156}
                  isDark={isDark}
                  mobileSliderOnly
                />
              </div>
              <div className="mt-4">
                <SwitchRow
                  id="follow-source-ratio"
                  title={t.gridFollowRatio}
                  description=""
                  checked={followSourceRatio}
                  onCheckedChange={onFollowSourceRatioChange}
                  isDark={isDark}
                />
              </div>
            </Tabs.Content>
          </Tabs.Root>
          <div className="mt-5 space-y-4">
            <div className={clsx("h-px", theme.divider)} />
            <SwitchRow
              id="grayscale-mode"
              title={t.grayscaleModeTitle}
              description=""
              checked={grayscaleMode}
              onCheckedChange={onGrayscaleModeChange}
              isDark={isDark}
            />
            <div className="space-y-3">
              <p className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.contrastTitle}</p>
              <SliderRow
                id="contrast"
                value={contrast}
                min={-100}
                max={100}
                step={1}
                onValueChange={onContrastChange}
                isDark={isDark}
              />
            </div>
            <div className={clsx("h-px", theme.divider)} />
            <div className="space-y-3">
              <p className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.renderStyleBiasTitle}</p>
              <div className={clsx("flex items-center justify-between text-xs", theme.cardMuted)}>
                <span>{t.renderStyleBiasRealistic}</span>
                <span>{t.renderStyleBiasPixelArt}</span>
              </div>
              <SliderRow
                id="render-style-bias"
                value={renderStyleBias}
                min={0}
                max={100}
                step={1}
                onValueChange={onRenderStyleBiasChange}
                isDark={isDark}
              />
            </div>
            <div className={clsx("h-px", theme.divider)} />
            <SwitchRow
              id="reduce-colors"
              title={t.reduceColorsTitle}
              description=""
              checked={grayscaleMode ? false : reduceColors}
              onCheckedChange={onReduceColorsChange}
              disabled={grayscaleMode}
              isDark={isDark}
            />
            <SliderRow
              id="reduce-tolerance"
              value={reduceTolerance}
              min={0}
              max={255}
              step={1}
              disabled={grayscaleMode || !reduceColors}
              onValueChange={onReduceToleranceChange}
              isDark={isDark}
            />

            <div className={clsx("h-px", theme.divider)} />
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label.Root
                  className={clsx("text-xs font-semibold uppercase tracking-[0.14em]", theme.cardMuted)}
                  htmlFor="fft-edge-enhance-strength"
                >
                  {t.fftEdgeEnhanceTitle}
                </Label.Root>
                <div ref={edgeColorPickerRef} className="relative shrink-0">
                  <button
                    className={clsx(
                      "flex h-9 w-9 items-center justify-center rounded-full border transition",
                      fftEdgeEnhanceOverrideOption ? theme.controlButtonActive : theme.pill,
                      fftEdgeEnhanceStrength <= 0 && "pointer-events-none opacity-45",
                    )}
                    onClick={() => setEdgeColorPickerOpen((current) => !current)}
                    title={edgeColorButtonTitle}
                    type="button"
                  >
                    {fftEdgeEnhanceOverrideOption ? (
                      <span
                        className="h-5 w-5 rounded-full border border-black/10"
                        style={{ backgroundColor: fftEdgeEnhanceOverrideOption.hex }}
                      />
                    ) : (
                      <span
                        className={clsx(
                          "flex h-5 w-5 items-center justify-center rounded-full border border-dashed text-[10px] font-semibold",
                          theme.cardMuted,
                        )}
                      >
                        A
                      </span>
                    )}
                  </button>
                  {edgeColorPickerOpen && portalReady && edgeColorPopupLayout
                      ? createPortal(
                        <div
                          ref={edgeColorPopupRef}
                          className={clsx(
                            "fixed z-20 rounded-[10px] border p-3 shadow-2xl",
                            theme.controlShell,
                          )}
                          style={{
                            left: edgeColorPopupLayout.left,
                            top: edgeColorPopupLayout.top,
                            width: edgeColorPopupLayout.width,
                          }}
                        >
                          <div className={clsx("mb-2 text-xs font-semibold uppercase tracking-[0.12em]", theme.cardMuted)}>
                            {t.edgeColorOverride}
                          </div>
                          <div className="max-h-[260px] overflow-auto pr-1">
                            <HoneycombColorGrid
                              isDark={isDark}
                              selectedLabel={fftEdgeEnhanceOverrideLabel ?? EDGE_COLOR_AUTO_LABEL}
                              options={sortedEdgeColorPickerOptions}
                              width={edgeColorPopupLayout.width - 24}
                              height={240}
                              onSelectLabel={(label) => {
                                onFftEdgeEnhanceOverrideLabelChange(
                                  label === EDGE_COLOR_AUTO_LABEL ? null : label,
                                );
                                setEdgeColorPickerOpen(false);
                              }}
                            />
                          </div>
                        </div>,
                        document.body,
                      )
                    : null}
                </div>
              </div>
              <SliderRow
                id="fft-edge-enhance-strength"
                value={fftEdgeEnhanceStrength}
                min={-100}
                max={100}
                step={1}
                onValueChange={onFftEdgeEnhanceStrengthChange}
                isDark={isDark}
              />
            </div>

            <div className={clsx("h-px", theme.divider)} />

            <SwitchRow
              id="pre-sharpen"
              title={t.preSharpenTitle}
              description=""
              checked={grayscaleMode ? false : preSharpen}
              onCheckedChange={onPreSharpenChange}
              disabled={grayscaleMode}
              isDark={isDark}
            />
            <SliderRow
              id="pre-sharpen-strength"
              value={preSharpenStrength}
              min={0}
              max={100}
              step={1}
              disabled={grayscaleMode || !preSharpen}
              onValueChange={onPreSharpenStrengthChange}
              isDark={isDark}
            />
          </div>
        </CollapsibleSection>
      </div>
    </section>
  );
}

function getRelativeLuminance(hex: string) {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

