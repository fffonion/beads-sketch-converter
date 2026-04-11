import clsx from "clsx";
import { useRef } from "react";
import { SwitchRow } from "./controls";
import {
  PindouBoardThemeButtons,
} from "./pixel-editor-chrome";
import type { Messages } from "../lib/i18n";
import type { PindouBoardTheme } from "../lib/pindou-board-theme";
import { getThemeClasses } from "../lib/theme";

export function ChartSettingsTab({
  t,
  isDark,
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
  chartLockEditing,
  onChartLockEditingChange,
  chartIncludeGuides,
  onChartIncludeGuidesChange,
  chartIncludeBoardPattern,
  onChartIncludeBoardPatternChange,
  chartBoardTheme,
  onChartBoardThemeChange,
  chartIncludeLegend,
  onChartIncludeLegendChange,
  chartIncludeQrCode,
  onChartIncludeQrCodeChange,
  chartPreviewUrl,
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
  isDark: boolean;
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
  chartLockEditing: boolean;
  onChartLockEditingChange: (value: boolean) => void;
  chartIncludeGuides: boolean;
  onChartIncludeGuidesChange: (value: boolean) => void;
  chartIncludeBoardPattern: boolean;
  onChartIncludeBoardPatternChange: (value: boolean) => void;
  chartBoardTheme: PindouBoardTheme;
  onChartBoardThemeChange: (value: PindouBoardTheme) => void;
  chartIncludeLegend: boolean;
  onChartIncludeLegendChange: (value: boolean) => void;
  chartIncludeQrCode: boolean;
  onChartIncludeQrCodeChange: (value: boolean) => void;
  chartPreviewUrl: string | null;
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chartSectionClassName = clsx(
    "rounded-md border p-3",
    isDark ? "border-white/12 bg-white/[0.035]" : "border-stone-300 bg-white/78",
  );
  const chartPanelClassName = clsx(
    "flex min-h-[200px] flex-col gap-2 rounded-md border p-3 xl:min-h-0",
    isDark ? "border-white/12 bg-white/[0.03]" : "border-stone-300 bg-white/78",
  );
  const chartPreviewClassName = clsx(
    "relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-md sm:min-h-[320px] xl:min-h-0 xl:flex-1",
    isDark ? "bg-white/[0.03]" : "bg-white/78",
  );
  const chartCodeFieldClassName = clsx(
    "rounded-md border px-3 py-2 shadow-inner transition",
    isDark
      ? "border-white/10 bg-[#110d0b] text-stone-200"
      : "border-stone-300 bg-[#f6efe2] text-stone-800",
  );
  const boardThemeLabels: Record<PindouBoardTheme, string> = {
    none: t.pindouBoardThemeNone ?? "无底纹",
    gray: t.pindouBoardThemeGray ?? "灰色系",
    green: t.pindouBoardThemeGreen ?? "绿色系",
    pink: t.pindouBoardThemePink ?? "粉色系",
    blue: t.pindouBoardThemeBlue ?? "蓝色系",
  };

  return (
    <section className="flex w-full flex-col overflow-visible">
      <div className="grid grid-cols-1 gap-4 px-3 py-3 sm:gap-5 sm:px-5 sm:py-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.62fr)] xl:items-stretch">
        <div className="flex flex-col gap-4 xl:h-full xl:self-stretch">
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
              id="chart-include-qr-code"
              title={t.chartSettingsIncludeQrCode}
              description={t.chartSettingsIncludeQrCodeDescription}
              checked={chartIncludeQrCode}
              onCheckedChange={onChartIncludeQrCodeChange}
              isDark={isDark}
            />
          </div>

          <div className={chartSectionClassName}>
            <SwitchRow
              id="chart-lock-editing"
              title={t.chartSettingsLockEditing}
              description={t.chartSettingsLockEditingDescription}
              checked={chartLockEditing}
              onCheckedChange={onChartLockEditingChange}
              isDark={isDark}
            />
          </div>

          <div className={chartSectionClassName}>
            <SwitchRow
              id="chart-save-metadata"
              title={t.chartSettingsSaveMetadata}
              description={
                chartLockEditing
                  ? t.chartSettingsSaveMetadataLockedDescription
                  : t.chartSettingsSaveMetadataDescription
              }
              checked={chartSaveMetadata}
              onCheckedChange={onChartSaveMetadataChange}
              isDark={isDark}
              disabled={chartLockEditing}
            />
          </div>

        </div>

        <aside className="order-last flex flex-col gap-3 xl:h-full xl:self-stretch">
          <div className={clsx(chartPanelClassName, "xl:flex-[2_1_0%]")}>
            <div className="flex items-center justify-between gap-3">
              <span className={clsx("text-sm font-semibold", theme.cardTitle)}>
                {t.chartSettingsPreview}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  className={clsx(
                    "h-10 rounded-md border px-4 text-sm font-semibold transition",
                    chartShareCode && !chartShareQrBusy ? theme.pill : theme.disabledButton,
                  )}
                  disabled={!chartShareCode || chartShareQrBusy}
                  onClick={() => void onExportChartShareQr()}
                  type="button"
                >
                  {t.chartSettingsExportQrCode}
                </button>
                <button
                  className={clsx(
                    "h-10 rounded-md border px-4 text-sm font-semibold transition",
                    !saveBusy && !chartPreviewBusy ? theme.primaryButton : theme.disabledButton,
                  )}
                  disabled={saveBusy || chartPreviewBusy}
                  onClick={() => void onSaveChart()}
                  type="button"
                >
                  {t.downloadPng}
                </button>
              </div>
            </div>
            <div className={chartPreviewClassName}>
              {chartPreviewUrl ? (
                <img
                  alt={t.chartSettingsPreview}
                  className="h-full max-h-full w-full max-w-full object-contain object-left"
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
          </div>
          <div className={clsx(chartPanelClassName, "xl:flex-[1_1_0%]")}>
            <div className="flex items-center justify-between gap-3">
              <span className={clsx("text-sm font-semibold", theme.cardTitle)}>
                {t.chartSettingsChartCode}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  className={clsx(
                    "h-10 rounded-md border px-4 text-sm font-semibold transition-all duration-200",
                    chartShareCode
                      ? chartShareLinkCopied
                        ? clsx(theme.primaryButton, "scale-[1.03] shadow-[0_6px_18px_rgba(120,72,18,0.14)]")
                        : theme.pill
                      : theme.disabledButton,
                  )}
                  disabled={!chartShareCode}
                  onClick={() => void onCopyChartShareLink()}
                  type="button"
                >
                  {chartShareLinkCopied ? t.chartSettingsCopyChartLinkCopied : t.chartSettingsCopyChartLink}
                </button>
                <button
                  className={clsx(
                    "h-10 rounded-md border px-4 text-sm font-semibold transition-all duration-200",
                    chartShareCode
                      ? chartShareCodeCopied
                        ? clsx(theme.primaryButton, "scale-[1.03] shadow-[0_6px_18px_rgba(120,72,18,0.14)]")
                        : theme.primaryButton
                      : theme.disabledButton,
                  )}
                  disabled={!chartShareCode}
                  onClick={() => void onCopyChartShareCode()}
                  type="button"
                >
                  {chartShareCodeCopied ? t.chartSettingsCopyChartCodeCopied : t.chartSettingsCopyChartCode}
                </button>
              </div>
            </div>
            <div
              className={clsx(
                "min-h-[160px] overflow-auto text-xs leading-5 xl:min-h-0 xl:flex-1",
                chartCodeFieldClassName,
              )}
            >
              <div className="break-all whitespace-normal">
                {chartShareCode || t.chartSettingsChartCodePlaceholder}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
