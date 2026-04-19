import * as Tabs from "@radix-ui/react-tabs";
import * as Label from "@radix-ui/react-label";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Messages } from "../lib/i18n";
import { getMobileCardSpacingTokens } from "../lib/mobile-card-spacing";
import type { NormalizedCropRect } from "../lib/chart-processor";
import { getThemeClasses } from "../lib/theme";
import { CollapsibleSection, NumberSliderField, SliderRow, SwitchRow } from "./controls";
import { HoneycombColorGrid, type HoneycombColorOption } from "./pixel-editor-color-picker";
import { OriginalPreviewCard } from "./preview-cards";

type GridMode = "auto" | "manual";
const EDGE_COLOR_AUTO_LABEL = "__EDGE_COLOR_AUTO__";

export function getImageProcessTabLayout(mode: GridMode) {
  return {
    showAutoDescription: mode === "auto",
    showManualSizing: mode === "manual",
    sections:
      mode === "auto"
        ? (["auto-description", "shared-controls"] as const)
        : (["manual-sizing", "shared-controls"] as const),
    seamlessTopSpacing: true,
  };
}

export function getEdgeColorPickerInlineLayout() {
  return {
    renderInlineSection: true,
    sectionWidthMode: "full" as const,
    honeycombScale: 2,
  };
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
  variant = "desktop",
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
  variant?: "desktop" | "mobile-app";
}) {
  const theme = getThemeClasses(isDark);
  const mobileApp = variant === "mobile-app";
  const mobileCardSpacing = getMobileCardSpacingTokens();
  const edgeColorInlinePanelRef = useRef<HTMLDivElement | null>(null);
  const [collapsedSections, setCollapsedSections] = useState(() => {
    return {
      source: false,
      grid: false,
    };
  });
  const [edgeColorPickerOpen, setEdgeColorPickerOpen] = useState(false);
  const [edgeColorInlinePanelWidth, setEdgeColorInlinePanelWidth] = useState(0);
  const edgeColorInlineLayout = getEdgeColorPickerInlineLayout();
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
  function renderSharedImageControls({
    includeLeadingDivider = true,
  }: {
    includeLeadingDivider?: boolean;
  } = {}) {
    return (
      <div className="space-y-4">
        {includeLeadingDivider ? <div className={clsx("h-px", theme.divider)} /> : null}
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
            <div className="shrink-0">
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
          {edgeColorPickerOpen && edgeColorInlineLayout.renderInlineSection ? (
            <div
              ref={edgeColorInlinePanelRef}
              className={clsx("w-full rounded-[12px] border p-3", theme.controlShell)}
            >
              <div
                className={clsx("mb-3 text-xs font-semibold uppercase tracking-[0.12em]", theme.cardMuted)}
              >
                {t.edgeColorOverride}
              </div>
              <div className="max-h-[420px] overflow-x-hidden overflow-y-auto">
                <HoneycombColorGrid
                  isDark={isDark}
                  selectedLabel={fftEdgeEnhanceOverrideLabel ?? EDGE_COLOR_AUTO_LABEL}
                  options={sortedEdgeColorPickerOptions}
                  width={Math.max(240, edgeColorInlinePanelWidth - 24)}
                  height={mobileApp ? 420 : 440}
                  sizeScale={edgeColorInlineLayout.honeycombScale}
                  onSelectLabel={(label) => {
                    onFftEdgeEnhanceOverrideLabelChange(
                      label === EDGE_COLOR_AUTO_LABEL ? null : label,
                    );
                  }}
                />
              </div>
            </div>
          ) : null}
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
    );
  }

  function renderImageProcessTabContent(mode: GridMode) {
    const imageProcessTabLayout = getImageProcessTabLayout(mode);

    return (
      <Tabs.Content value={mode} className="space-y-0 outline-none">
        {imageProcessTabLayout.showAutoDescription ? (
          <div className={clsx(mobileCardSpacing.contentSpacing, "text-sm", theme.cardMuted)}>
            {t.gridAutoDescription}
          </div>
        ) : null}

        {imageProcessTabLayout.showManualSizing ? (
          <div className={mobileCardSpacing.contentSpacing}>
            <div className={clsx("grid sm:grid-cols-2", mobileCardSpacing.stackedGap)}>
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
            <div className={mobileCardSpacing.followUpSpacing}>
              <SwitchRow
                id="follow-source-ratio"
                title={t.gridFollowRatio}
                description=""
                checked={followSourceRatio}
                onCheckedChange={onFollowSourceRatioChange}
                isDark={isDark}
              />
            </div>
          </div>
        ) : null}

        {renderSharedImageControls({
          includeLeadingDivider:
            imageProcessTabLayout.showAutoDescription || imageProcessTabLayout.showManualSizing,
        })}
      </Tabs.Content>
    );
  }

  function toggleSection(section: keyof typeof collapsedSections) {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  useEffect(() => {
    if (!edgeColorPickerOpen) {
      return;
    }

    if (!edgeColorInlinePanelRef.current) {
      return;
    }
    const panelElement = edgeColorInlinePanelRef.current!;

    function syncInlinePanelWidth() {
      const nextWidth = Math.floor(panelElement.getBoundingClientRect().width);
      if (nextWidth > 0) {
        setEdgeColorInlinePanelWidth((current) => (current === nextWidth ? current : nextWidth));
      }
    }

    syncInlinePanelWidth();
    const observer = new ResizeObserver(syncInlinePanelWidth);
    observer.observe(panelElement);
    return () => {
      observer.disconnect();
    };
  }, [edgeColorPickerOpen]);

  return (
    <section
      className={clsx(
        mobileApp
          ? "scrollbar-none min-h-0 overflow-y-auto px-2 pb-3 pt-1"
          : "scrollbar-none min-h-0 overflow-y-auto rounded-[14px] border pb-4 pl-4 pr-3 pt-4 backdrop-blur transition-colors sm:rounded-[16px] sm:pb-5 sm:pl-5 sm:pr-4 sm:pt-5 lg:h-full lg:self-start xl:rounded-[18px]",
        mobileApp ? "" : theme.panel,
      )}
      style={mobileApp ? { paddingBottom: "calc(env(safe-area-inset-bottom) + 5rem)" } : undefined}
    >
      <div className={clsx(mobileApp ? "space-y-2.5" : "space-y-5")}>
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
          variant={mobileApp ? "mobile-app" : "default"}
        />

        <CollapsibleSection
          title={t.gridTitle}
          collapsed={collapsedSections.grid}
          onToggle={() => toggleSection("grid")}
          isDark={isDark}
          variant={mobileApp ? "mobile-app" : "default"}
        >
          <Tabs.Root value={gridMode} onValueChange={(value) => onGridModeChange(value as GridMode)}>
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
            {renderImageProcessTabContent("auto")}
            {renderImageProcessTabContent("manual")}
          </Tabs.Root>
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

