import * as Tabs from "@radix-ui/react-tabs";
import clsx from "clsx";
import type { Messages } from "../lib/i18n";
import type { NormalizedCropRect } from "../lib/mard";
import { colorSystemOptions } from "../lib/mard";
import { getThemeClasses } from "../lib/theme";
import { NumberSliderField, SliderRow, SwitchRow } from "./controls";
import { OriginalPreviewCard } from "./preview-cards";

type GridMode = "auto" | "manual";

export function SidebarPanel({
  t,
  file,
  inputUrl,
  cropMode,
  onCropModeChange,
  cropRect,
  onCropChange,
  busy,
  isDark,
  colorSystemId,
  onColorSystemIdChange,
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
  onCropChange: (cropRect: NormalizedCropRect | null) => void;
  busy: boolean;
  isDark: boolean;
  colorSystemId: string;
  onColorSystemIdChange: (value: string) => void;
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

  return (
    <section className={clsx("rounded-[14px] border p-4 backdrop-blur transition-colors sm:rounded-[16px] sm:p-5 xl:sticky xl:top-6 xl:self-start xl:rounded-[18px]", theme.panel)}>
      <div className="space-y-5">
        <OriginalPreviewCard
          title={t.sourceTitle}
          subtitle={t.sourceSubtitle}
          privacyNote={t.sourcePrivacyNote}
          file={file}
          url={inputUrl}
          emptyText={t.sourceEmpty}
          sourceLocalOnly={t.sourceLocalOnly}
          sourceChooseImage={t.sourceChooseImage}
          sourceStayInTab={t.sourceStayInTab}
          onFileSelection={onFileSelection}
          cropTitle={t.cropTitle}
          cropHint={t.cropHint}
          cropReset={t.cropReset}
          cropEdit={t.cropEdit}
          cropMode={cropMode}
          onCropModeChange={onCropModeChange}
          cropRect={cropRect}
          onCropChange={onCropChange}
          isDark={isDark}
        />

        <section className={clsx("rounded-[10px] border p-4 transition-colors sm:rounded-[12px] xl:rounded-[14px]", theme.card)}>
          <p className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.gridTitle}</p>
          <p className={clsx("mt-1 text-xs", theme.cardMuted)}>{t.gridSubtitle}</p>

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
                  max={512}
                  isDark={isDark}
                />
                <NumberSliderField
                  id="grid-height"
                  label={t.gridHeight}
                  value={gridHeight}
                  onChange={onGridHeightChange}
                  min={1}
                  max={512}
                  isDark={isDark}
                />
              </div>
              <div className="mt-4">
                <SwitchRow
                  id="follow-source-ratio"
                  title={t.gridFollowRatio}
                  description={t.gridFollowRatioDescription}
                  checked={followSourceRatio}
                  onCheckedChange={onFollowSourceRatioChange}
                  isDark={isDark}
                />
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </section>

        <section className={clsx("rounded-[10px] border p-4 transition-colors sm:rounded-[12px] xl:rounded-[14px]", theme.card)}>
          <p className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.polishTitle}</p>
          <div className="mt-4 space-y-4">
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
        </section>

        <section className={clsx("rounded-[10px] border p-4 transition-colors sm:rounded-[12px] xl:rounded-[14px]", theme.card)}>
          <p className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.colorSystemTitle}</p>
          <p className={clsx("mt-1 text-xs", theme.cardMuted)}>{t.colorSystemSubtitle}</p>
          <select
            className={clsx("mt-4 w-full rounded-lg border px-4 py-3 text-sm outline-none transition", theme.input)}
            value={colorSystemId}
            onChange={(event) => onColorSystemIdChange(event.target.value)}
          >
            {colorSystemOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </section>

        <div className={clsx("rounded-[10px] px-4 py-3 text-sm font-semibold transition-colors sm:rounded-[12px] xl:rounded-[14px] xl:px-5 xl:py-4", theme.statusBar(!file, busy))}>
          {!file ? t.sourceEmpty : busy ? t.processing : t.generateChart}
        </div>
      </div>
    </section>
  );
}
