import * as Tabs from "@radix-ui/react-tabs";
import clsx from "clsx";
import { useState } from "react";
import type { Messages } from "../lib/i18n";
import type { NormalizedCropRect } from "../lib/mard";
import { getThemeClasses } from "../lib/theme";
import { CollapsibleSection, NumberSliderField, SliderRow, SwitchRow } from "./controls";
import { OriginalPreviewCard } from "./preview-cards";

type GridMode = "auto" | "manual";

export function SidebarPanel({
  t,
  file,
  inputUrl,
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
  reduceColors,
  onReduceColorsChange,
  reduceTolerance,
  onReduceToleranceChange,
  preSharpen,
  onPreSharpenChange,
  preSharpenStrength,
  onPreSharpenStrengthChange,
  onFileSelection,
}: {
  t: Messages;
  file: File | null;
  inputUrl: string | null;
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
  reduceColors: boolean;
  onReduceColorsChange: (checked: boolean) => void;
  reduceTolerance: number;
  onReduceToleranceChange: (value: number) => void;
  preSharpen: boolean;
  onPreSharpenChange: (checked: boolean) => void;
  preSharpenStrength: number;
  onPreSharpenStrengthChange: (value: number) => void;
  onFileSelection: (file: File | null) => void;
}) {
  const theme = getThemeClasses(isDark);
  const [collapsedSections, setCollapsedSections] = useState(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
    return {
      source: false,
      grid: isMobile,
      polish: isMobile,
    };
  });

  function toggleSection(section: keyof typeof collapsedSections) {
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  return (
    <section
      className={clsx(
        "scrollbar-none min-h-0 overflow-y-auto rounded-[14px] border p-4 backdrop-blur transition-colors sm:rounded-[16px] sm:p-5 xl:h-full xl:self-start xl:rounded-[18px]",
        theme.panel,
      )}
    >
      <div className="space-y-5">
        <OriginalPreviewCard
          title={t.sourceTitle}
          file={file}
          url={inputUrl}
          busy={busy}
          emptyText={t.sourceEmpty}
          sourceChooseImage={t.sourceChooseImage}
          sourceStayInTab={t.sourceStayInTab}
          onFileSelection={onFileSelection}
          cropReset={t.cropReset}
          cropEdit={t.cropEdit}
          cropMode={cropMode}
          onCropModeChange={onCropModeChange}
          cropRect={cropRect}
          displayCropRect={displayCropRect}
          onCropChange={onCropChange}
          isDark={isDark}
          collapsed={collapsedSections.source}
          onToggleCollapsed={() => toggleSection("source")}
        />

        <CollapsibleSection
          title={t.gridTitle}
          subtitle={t.gridSubtitle}
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
        </CollapsibleSection>

        <CollapsibleSection
          title={t.polishTitle}
          collapsed={collapsedSections.polish}
          onToggle={() => toggleSection("polish")}
          isDark={isDark}
        >
          <div className="space-y-4">
            <SwitchRow
              id="reduce-colors"
              title={t.reduceColorsTitle}
              description={t.reduceColorsDescription}
              checked={reduceColors}
              onCheckedChange={onReduceColorsChange}
              isDark={isDark}
            />
            <SliderRow
              id="reduce-tolerance"
              label={t.tolerance}
              value={reduceTolerance}
              min={0}
              max={255}
              step={1}
              disabled={!reduceColors}
              onValueChange={onReduceToleranceChange}
              isDark={isDark}
            />

            <div className={clsx("h-px", theme.divider)} />

            <SwitchRow
              id="pre-sharpen"
              title={t.preSharpenTitle}
              description={t.preSharpenDescription}
              checked={preSharpen}
              onCheckedChange={onPreSharpenChange}
              isDark={isDark}
            />
            <SliderRow
              id="pre-sharpen-strength"
              label={t.strength}
              value={preSharpenStrength}
              min={0}
              max={100}
              step={1}
              disabled={!preSharpen}
              onValueChange={onPreSharpenStrengthChange}
              isDark={isDark}
            />
          </div>
        </CollapsibleSection>
      </div>
    </section>
  );
}
