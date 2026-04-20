import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SwitchRow } from "./controls";
import {
  PindouBoardThemeButtons,
} from "./pixel-editor-chrome";
import type { Messages } from "../lib/i18n";
import { getMobileCardSpacingTokens } from "../lib/mobile-card-spacing";
import type { PindouBoardTheme } from "../lib/pindou-board-theme";
import { getThemeClasses } from "../lib/theme";
import { useLandscapeViewport } from "../lib/use-landscape-viewport";

function formatChartCodeSize(byteLength: number) {
  if (byteLength < 1024) {
    return `${byteLength} B`;
  }

  const kilobytes = byteLength / 1024;
  const roundedKilobytes =
    kilobytes >= 10 ? Math.round(kilobytes) : Math.round(kilobytes * 10) / 10;
  return `${roundedKilobytes} KB`;
}

function MobileSettingsGroup({
  isDark,
  tone = "subtle",
  children,
}: {
  isDark: boolean;
  tone?: "subtle" | "plain";
  children: ReactNode;
}) {
  return (
    <div
      data-mobile-group-tone={tone}
      className={clsx(
        "overflow-hidden rounded-[14px] border",
        tone === "plain"
          ? isDark
            ? "border-white/12 bg-white/[0.06]"
            : "border-stone-300 bg-white"
          : isDark
            ? "border-white/12 bg-white/[0.035]"
            : "border-stone-300 bg-[#f6efe2]",
      )}
    >
      {children}
    </div>
  );
}

function MobileSettingsItem({
  isDark,
  divider = true,
  children,
}: {
  isDark: boolean;
  divider?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={clsx(
        getMobileCardSpacingTokens().rowPadding,
        divider && (isDark ? "border-b border-white/10" : "border-b border-stone-200"),
      )}
    >
      {children}
    </div>
  );
}

function MobileSettingsSwitchItem({
  isDark,
  id,
  title,
  description,
  checked,
  onCheckedChange,
  divider = true,
  disabled = false,
}: {
  isDark: boolean;
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  divider?: boolean;
  disabled?: boolean;
}) {
  return (
    <MobileSettingsItem divider={divider} isDark={isDark}>
      <SwitchRow
        id={id}
        title={title}
        description={description ?? ""}
        checked={checked}
        onCheckedChange={onCheckedChange}
        isDark={isDark}
        disabled={disabled}
      />
    </MobileSettingsItem>
  );
}

export function getMobileChartSettingsLayout({
  mobileApp,
  isLandscapeViewport,
}: {
  mobileApp: boolean;
  isLandscapeViewport: boolean;
}) {
  if (!mobileApp) {
    return {
      useTwoColumn: false,
      wrapperClassName: "flex flex-col gap-2 px-2 py-1",
      leadColumnClassName: "",
      settingsColumnClassName: "",
    };
  }

  if (isLandscapeViewport) {
    return {
      useTwoColumn: true,
      wrapperClassName:
        "grid min-h-0 grid-cols-[minmax(270px,0.94fr)_minmax(0,1.06fr)] items-start gap-3 px-2 py-1",
      leadColumnClassName: "min-h-0 space-y-2",
      settingsColumnClassName: "min-h-0 space-y-2",
    };
  }

  return {
    useTwoColumn: false,
    wrapperClassName: "flex flex-col gap-2 px-2 py-1",
    leadColumnClassName: "",
    settingsColumnClassName: "",
  };
}

type MobileChartPreviewAndCodeGroupProps = {
  t: Messages;
  isDark: boolean;
  theme: ReturnType<typeof getThemeClasses>;
  mobileCardSpacing: ReturnType<typeof getMobileCardSpacingTokens>;
  chartShareCode: string;
  chartShareCodeSizeText: string;
  chartShareLinkCopied: boolean;
  chartShareCodeCopied: boolean;
  chartPreviewUrl: string | null;
  chartPreviewError: string | null;
  chartPreviewBusy: boolean;
  chartShareQrBusy: boolean;
  saveBusy: boolean;
  chartPreviewClassName: string;
  chartCodeFieldClassName: string;
  onExportChartShareQr: () => void | Promise<void>;
  onSaveChart: () => void | Promise<void>;
  onCopyChartShareLink: () => void | Promise<void>;
  onCopyChartShareCode: () => void | Promise<void>;
};

function MobileChartPreviewAndCodeGroup({
  t,
  isDark,
  theme,
  mobileCardSpacing,
  chartShareCode,
  chartShareCodeSizeText,
  chartShareLinkCopied,
  chartShareCodeCopied,
  chartPreviewUrl,
  chartPreviewError,
  chartPreviewBusy,
  chartShareQrBusy,
  saveBusy,
  chartPreviewClassName,
  chartCodeFieldClassName,
  onExportChartShareQr,
  onSaveChart,
  onCopyChartShareLink,
  onCopyChartShareCode,
}: MobileChartPreviewAndCodeGroupProps) {
  return (
    <MobileSettingsGroup isDark={isDark} tone="subtle">
      <MobileSettingsItem isDark={isDark}>
        <div className={clsx("flex flex-col", mobileCardSpacing.stackedGap)}>
          <div className="flex items-center justify-between gap-3">
            <span className={clsx("text-sm font-semibold", theme.cardTitle)}>
              {t.chartSettingsPreview}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={clsx(
                  "h-11 rounded-[10px] border px-3 text-sm font-semibold transition",
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
                  "h-11 rounded-[10px] border px-3 text-sm font-semibold transition",
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
          <div data-mobile-export-surface="preview" className={chartPreviewClassName}>
            {chartPreviewUrl ? (
              <img
                alt={t.chartSettingsPreview}
                className="h-full max-h-full w-full max-w-full object-contain object-center"
                src={chartPreviewUrl}
              />
            ) : chartPreviewError ? (
              <div className="flex max-w-[280px] flex-col items-center gap-2 px-5 text-center">
                <p className={clsx("text-sm font-semibold", isDark ? "text-rose-200" : "text-rose-700")}>
                  {t.chartSettingsPreviewError}
                </p>
                <p className={clsx("text-sm leading-6", theme.cardMuted)}>
                  {chartPreviewError}
                </p>
              </div>
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
      </MobileSettingsItem>

      <MobileSettingsItem isDark={isDark} divider={false}>
        <div className={clsx("flex flex-col", mobileCardSpacing.stackedGap)}>
          <div className={clsx("flex flex-col items-start", mobileCardSpacing.stackedGap)}>
            <div className="flex min-w-0 items-center gap-3">
              <span className={clsx("shrink-0 whitespace-nowrap text-sm font-semibold", theme.cardTitle)}>
                {t.chartSettingsChartCode}
              </span>
              <span className={clsx("shrink-0 text-xs", theme.cardMuted)}>
                {t.chartSettingsChartCodeSize} {chartShareCodeSizeText}
              </span>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2">
              <button
                className={clsx(
                  "h-11 flex-1 rounded-[10px] border px-3 text-sm font-semibold transition-all duration-200",
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
                  "h-11 flex-1 rounded-[10px] border px-3 text-sm font-semibold transition-all duration-200",
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
            data-mobile-export-surface="chart-code"
            className={clsx("h-[88px] overflow-auto text-xs leading-5", chartCodeFieldClassName)}
          >
            <div className="break-all whitespace-pre-wrap [overflow-wrap:anywhere]">
              {chartShareCode || t.chartSettingsChartCodePlaceholder}
            </div>
          </div>
        </div>
      </MobileSettingsItem>
    </MobileSettingsGroup>
  );
}

type MobileChartBasicsGroupProps = {
  t: Messages;
  isDark: boolean;
  theme: ReturnType<typeof getThemeClasses>;
  mobileCardSpacing: ReturnType<typeof getMobileCardSpacingTokens>;
  chartExportTitle: string;
  chartWatermarkText: string;
  chartWatermarkImageDataUrl: string | null;
  chartWatermarkImageName: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onChartExportTitleChange: (value: string) => void;
  onChartWatermarkTextChange: (value: string) => void;
  onChartWatermarkImageClear: () => void;
};

function MobileChartBasicsGroup({
  t,
  isDark,
  theme,
  mobileCardSpacing,
  chartExportTitle,
  chartWatermarkText,
  chartWatermarkImageDataUrl,
  chartWatermarkImageName,
  fileInputRef,
  onChartExportTitleChange,
  onChartWatermarkTextChange,
  onChartWatermarkImageClear,
}: MobileChartBasicsGroupProps) {
  return (
    <MobileSettingsGroup isDark={isDark} tone="plain">
      <MobileSettingsItem isDark={isDark}>
        <label className={clsx("flex flex-col", mobileCardSpacing.stackedGap)}>
          <span className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.chartSettingsChartTitle}</span>
          <input
            className={clsx("h-10 rounded-md border px-3 text-sm outline-none transition", theme.input)}
            placeholder={t.chartSettingsChartTitlePlaceholder}
            type="text"
            value={chartExportTitle}
            onChange={(event) => onChartExportTitleChange(event.target.value)}
          />
        </label>
      </MobileSettingsItem>

      <MobileSettingsItem isDark={isDark}>
        <label className={clsx("flex flex-col", mobileCardSpacing.stackedGap)}>
          <span className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.chartSettingsWatermarkText}</span>
          <input
            className={clsx("h-10 rounded-md border px-3 text-sm outline-none transition", theme.input)}
            placeholder={t.appTitle}
            type="text"
            value={chartWatermarkText}
            onChange={(event) => onChartWatermarkTextChange(event.target.value)}
          />
        </label>
      </MobileSettingsItem>

      <MobileSettingsItem isDark={isDark} divider={false}>
        <div className={clsx("flex flex-col", mobileCardSpacing.stackedGap)}>
          <span className={clsx("text-sm font-semibold", theme.cardTitle)}>{t.chartSettingsWatermarkImage}</span>
          <div className={clsx("flex flex-wrap items-center gap-2 rounded-[10px] p-2.5", theme.subtlePanel)}>
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
      </MobileSettingsItem>
    </MobileSettingsGroup>
  );
}

type MobileChartOptionsGroupProps = {
  t: Messages;
  isDark: boolean;
  chartIncludeGuides: boolean;
  chartShowColorLabels: boolean;
  chartGaplessCells: boolean;
  chartIncludeBoardPattern: boolean;
  chartBoardTheme: PindouBoardTheme;
  chartIncludeLegend: boolean;
  chartIncludeQrCode: boolean;
  chartLockEditing: boolean;
  chartSaveMetadata: boolean;
  onChartIncludeGuidesChange: (value: boolean) => void;
  onChartShowColorLabelsChange: (value: boolean) => void;
  onChartGaplessCellsChange: (value: boolean) => void;
  onChartIncludeBoardPatternChange: (value: boolean) => void;
  onChartBoardThemeChange: (value: PindouBoardTheme) => void;
  onChartIncludeLegendChange: (value: boolean) => void;
  onChartIncludeQrCodeChange: (value: boolean) => void;
  onChartLockEditingChange: (value: boolean) => void;
  onChartSaveMetadataChange: (value: boolean) => void;
  boardThemeLabels: Record<PindouBoardTheme, string>;
};

function MobileChartOptionsGroup({
  t,
  isDark,
  chartIncludeGuides,
  chartShowColorLabels,
  chartGaplessCells,
  chartIncludeBoardPattern,
  chartBoardTheme,
  chartIncludeLegend,
  chartIncludeQrCode,
  chartLockEditing,
  chartSaveMetadata,
  onChartIncludeGuidesChange,
  onChartShowColorLabelsChange,
  onChartGaplessCellsChange,
  onChartIncludeBoardPatternChange,
  onChartBoardThemeChange,
  onChartIncludeLegendChange,
  onChartIncludeQrCodeChange,
  onChartLockEditingChange,
  onChartSaveMetadataChange,
  boardThemeLabels,
}: MobileChartOptionsGroupProps) {
  return (
    <MobileSettingsGroup isDark={isDark} tone="plain">
      <MobileSettingsSwitchItem
        id="chart-include-guides"
        title={t.chartSettingsIncludeGuides}
        description={t.chartSettingsIncludeGuidesDescription}
        checked={chartIncludeGuides}
        onCheckedChange={onChartIncludeGuidesChange}
        isDark={isDark}
      />
      <MobileSettingsSwitchItem
        id="chart-show-color-labels"
        title={t.chartSettingsShowColorLabels}
        description={t.chartSettingsShowColorLabelsDescription}
        checked={chartShowColorLabels}
        onCheckedChange={onChartShowColorLabelsChange}
        isDark={isDark}
      />
      <MobileSettingsSwitchItem
        id="chart-gapless-cells"
        title={t.chartSettingsGaplessCells}
        description={t.chartSettingsGaplessCellsDescription}
        checked={chartGaplessCells}
        onCheckedChange={onChartGaplessCellsChange}
        isDark={isDark}
      />
      <MobileSettingsItem isDark={isDark}>
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
              groupLabel={t.pindouBoardThemeLabel ?? "拼豆板主题"}
              onChange={onChartBoardThemeChange}
            />
          </div>
        </div>
      </MobileSettingsItem>
      <MobileSettingsSwitchItem
        id="chart-include-legend"
        title={t.chartSettingsIncludeLegend}
        description={t.chartSettingsIncludeLegendDescription}
        checked={chartIncludeLegend}
        onCheckedChange={onChartIncludeLegendChange}
        isDark={isDark}
      />
      <MobileSettingsSwitchItem
        id="chart-include-qr-code"
        title={t.chartSettingsIncludeQrCode}
        description={t.chartSettingsIncludeQrCodeDescription}
        checked={chartIncludeQrCode}
        onCheckedChange={onChartIncludeQrCodeChange}
        isDark={isDark}
      />
      <MobileSettingsSwitchItem
        id="chart-lock-editing"
        title={t.chartSettingsLockEditing}
        description={t.chartSettingsLockEditingDescription}
        checked={chartLockEditing}
        onCheckedChange={onChartLockEditingChange}
        isDark={isDark}
      />
      <MobileSettingsSwitchItem
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
        divider={false}
      />
    </MobileSettingsGroup>
  );
}

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
  variant = "desktop",
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
  variant?: "desktop" | "mobile-app";
}) {
  const theme = getThemeClasses(isDark);
  const mobileApp = variant === "mobile-app";
  const mobileCardSpacing = getMobileCardSpacingTokens();
  const isLandscapeViewport = useLandscapeViewport({ enabled: mobileApp });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const settingsColumnRef = useRef<HTMLDivElement | null>(null);
  const [rightSidebarHeight, setRightSidebarHeight] = useState<number | null>(null);
  const mobileLayout = getMobileChartSettingsLayout({
    mobileApp,
    isLandscapeViewport,
  });
  const chartSectionClassName = clsx(
    mobileApp ? "rounded-[14px] border p-3" : "rounded-md border p-3",
    isDark ? "border-white/12 bg-white/[0.035]" : "border-stone-300 bg-white/78",
  );
  const chartPanelClassName = clsx(
    mobileApp
      ? "flex min-h-[220px] flex-col gap-2.5 rounded-[14px] border p-3 xl:min-h-0 xl:overflow-hidden"
      : "flex min-h-[200px] flex-col gap-2 rounded-md border p-3 xl:min-h-0 xl:overflow-hidden",
    isDark ? "border-white/12 bg-white/[0.03]" : "border-stone-300 bg-[#f6efe2]",
  );
  const chartPreviewClassName = clsx(
    mobileApp
      ? "relative flex aspect-[3/4] w-full flex-none items-center justify-center overflow-hidden rounded-[16px]"
      : "relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-md sm:min-h-[320px] xl:min-h-0 xl:flex-1",
    mobileApp
      ? isDark
        ? "bg-[#16120f]"
        : "bg-[#faf4e9]"
      : isDark
        ? "bg-white/[0.03]"
        : "bg-white/78",
  );
  const chartCodeFieldClassName = clsx(
    "rounded-md border px-3 py-2 shadow-inner transition",
    mobileApp
      ? isDark
        ? "border-white/10 bg-[#16120f] text-stone-200"
        : "border-stone-300 bg-[#faf4e9] text-stone-800"
      : isDark
        ? "border-white/10 bg-[#110d0b] text-stone-200"
        : "border-stone-300 bg-[#f6efe2] text-stone-800",
  );
  const chartShareCodeBytes =
    chartShareCode && typeof TextEncoder !== "undefined"
      ? new TextEncoder().encode(chartShareCode).length
      : 0;
  const chartShareCodeSizeText = formatChartCodeSize(chartShareCodeBytes);
  const boardThemeLabels: Record<PindouBoardTheme, string> = {
    none: t.pindouBoardThemeNone ?? "无底纹",
    gray: t.pindouBoardThemeGray ?? "灰色系",
    green: t.pindouBoardThemeGreen ?? "绿色系",
    pink: t.pindouBoardThemePink ?? "粉色系",
    blue: t.pindouBoardThemeBlue ?? "蓝色系",
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function syncRightSidebarHeight() {
      if (window.innerWidth < 1280 || !settingsColumnRef.current) {
        setRightSidebarHeight((previous) => (previous === null ? previous : null));
        return;
      }

      const nextHeight = Math.ceil(settingsColumnRef.current.getBoundingClientRect().height);
      setRightSidebarHeight((previous) => (previous === nextHeight ? previous : nextHeight));
    }

    syncRightSidebarHeight();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncRightSidebarHeight);
      return () => {
        window.removeEventListener("resize", syncRightSidebarHeight);
      };
    }

    const observer = new ResizeObserver(() => syncRightSidebarHeight());
    if (settingsColumnRef.current) {
      observer.observe(settingsColumnRef.current);
    }
    window.addEventListener("resize", syncRightSidebarHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncRightSidebarHeight);
    };
  }, []);

  if (mobileApp) {
    return (
      <section className="flex w-full flex-col overflow-visible">
        <input
          ref={fileInputRef}
          accept="image/*"
          className="hidden"
          type="file"
          onChange={(event) => void onChartWatermarkImageFile(event.target.files?.[0] ?? null)}
        />
        <div className={mobileLayout.wrapperClassName}>
          <div className={mobileLayout.leadColumnClassName}>
            <MobileChartPreviewAndCodeGroup
              t={t}
              isDark={isDark}
              theme={theme}
              mobileCardSpacing={mobileCardSpacing}
              chartShareCode={chartShareCode}
              chartShareCodeSizeText={chartShareCodeSizeText}
              chartShareLinkCopied={chartShareLinkCopied}
              chartShareCodeCopied={chartShareCodeCopied}
              chartPreviewUrl={chartPreviewUrl}
              chartPreviewError={chartPreviewError}
              chartPreviewBusy={chartPreviewBusy}
              chartShareQrBusy={chartShareQrBusy}
              saveBusy={saveBusy}
              chartPreviewClassName={chartPreviewClassName}
              chartCodeFieldClassName={chartCodeFieldClassName}
              onExportChartShareQr={onExportChartShareQr}
              onSaveChart={onSaveChart}
              onCopyChartShareLink={onCopyChartShareLink}
              onCopyChartShareCode={onCopyChartShareCode}
            />
          </div>

          <div className={mobileLayout.settingsColumnClassName}>
            <MobileChartBasicsGroup
              t={t}
              isDark={isDark}
              theme={theme}
              mobileCardSpacing={mobileCardSpacing}
              chartExportTitle={chartExportTitle}
              chartWatermarkText={chartWatermarkText}
              chartWatermarkImageDataUrl={chartWatermarkImageDataUrl}
              chartWatermarkImageName={chartWatermarkImageName}
              fileInputRef={fileInputRef}
              onChartExportTitleChange={onChartExportTitleChange}
              onChartWatermarkTextChange={onChartWatermarkTextChange}
              onChartWatermarkImageClear={onChartWatermarkImageClear}
            />

            <MobileSettingsGroup isDark={isDark} tone="plain">
            <MobileSettingsSwitchItem
              id="chart-include-guides"
              title={t.chartSettingsIncludeGuides}
              description={t.chartSettingsIncludeGuidesDescription}
              checked={chartIncludeGuides}
              onCheckedChange={onChartIncludeGuidesChange}
              isDark={isDark}
            />
            <MobileSettingsSwitchItem
              id="chart-show-color-labels"
              title={t.chartSettingsShowColorLabels}
              description={t.chartSettingsShowColorLabelsDescription}
              checked={chartShowColorLabels}
              onCheckedChange={onChartShowColorLabelsChange}
              isDark={isDark}
            />
            <MobileSettingsSwitchItem
              id="chart-gapless-cells"
              title={t.chartSettingsGaplessCells}
              description={t.chartSettingsGaplessCellsDescription}
              checked={chartGaplessCells}
              onCheckedChange={onChartGaplessCellsChange}
              isDark={isDark}
            />
            <MobileSettingsItem isDark={isDark}>
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
                    groupLabel={t.pindouBoardThemeLabel ?? "搴曠汗"}
                    onChange={onChartBoardThemeChange}
                  />
                </div>
              </div>
            </MobileSettingsItem>
            <MobileSettingsSwitchItem
              id="chart-include-legend"
              title={t.chartSettingsIncludeLegend}
              description={t.chartSettingsIncludeLegendDescription}
              checked={chartIncludeLegend}
              onCheckedChange={onChartIncludeLegendChange}
              isDark={isDark}
            />
            <MobileSettingsSwitchItem
              id="chart-include-qr-code"
              title={t.chartSettingsIncludeQrCode}
              description={t.chartSettingsIncludeQrCodeDescription}
              checked={chartIncludeQrCode}
              onCheckedChange={onChartIncludeQrCodeChange}
              isDark={isDark}
            />
            <MobileSettingsSwitchItem
              id="chart-lock-editing"
              title={t.chartSettingsLockEditing}
              description={t.chartSettingsLockEditingDescription}
              checked={chartLockEditing}
              onCheckedChange={onChartLockEditingChange}
              isDark={isDark}
            />
            <MobileSettingsSwitchItem
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
              divider={false}
            />
            </MobileSettingsGroup>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex w-full flex-col overflow-visible">
      <div className={clsx(
        "grid grid-cols-1 gap-4",
        "px-3 py-3 sm:gap-5 sm:px-5 sm:py-5",
        "xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.62fr)] xl:items-start",
      )}>
        <div ref={settingsColumnRef} className="flex flex-col gap-4 xl:self-start">
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
            <SwitchRow
              id="chart-show-color-labels"
              title={t.chartSettingsShowColorLabels}
              description={t.chartSettingsShowColorLabelsDescription}
              checked={chartShowColorLabels}
              onCheckedChange={onChartShowColorLabelsChange}
              isDark={isDark}
            />
          </div>

          <div className={chartSectionClassName}>
            <SwitchRow
              id="chart-gapless-cells"
              title={t.chartSettingsGaplessCells}
              description={t.chartSettingsGaplessCellsDescription}
              checked={chartGaplessCells}
              onCheckedChange={onChartGaplessCellsChange}
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

        <aside
          className="order-last flex min-h-0 flex-col gap-3 xl:self-start xl:overflow-hidden"
          style={
            rightSidebarHeight
              ? {
                  height: `${rightSidebarHeight}px`,
                  maxHeight: `${rightSidebarHeight}px`,
                }
              : undefined
          }
        >
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
              ) : chartPreviewError ? (
                <div className="flex max-w-[280px] flex-col items-center gap-2 px-5 text-center">
                  <p className={clsx("text-sm font-semibold", isDark ? "text-rose-200" : "text-rose-700")}>
                    {t.chartSettingsPreviewError}
                  </p>
                  <p className={clsx("text-sm leading-6", theme.cardMuted)}>
                    {chartPreviewError}
                  </p>
                </div>
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
              <div className="flex min-w-0 items-center gap-3">
                <span className={clsx("shrink-0 whitespace-nowrap text-sm font-semibold", theme.cardTitle)}>
                  {t.chartSettingsChartCode}
                </span>
                <span className={clsx("shrink-0 text-xs", theme.cardMuted)}>
                  {t.chartSettingsChartCodeSize} {chartShareCodeSizeText}
                </span>
              </div>
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
              <div className="break-all whitespace-pre-wrap [overflow-wrap:anywhere]">
                {chartShareCode || t.chartSettingsChartCodePlaceholder}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
