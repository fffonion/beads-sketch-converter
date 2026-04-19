import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ChartSettingsTab,
  getMobileChartSettingsLayout,
} from "../src/components/chart-settings-tab";
import { messages } from "../src/lib/i18n";

function renderChartSettingsTab({
  chartPreviewError = null,
  chartShareCode = "",
  chartPreviewUrl = null,
  variant = "desktop",
}: {
  chartPreviewError?: string | null;
  chartShareCode?: string;
  chartPreviewUrl?: string | null;
  variant?: "desktop" | "mobile-app";
}) {
  return renderToStaticMarkup(
    <ChartSettingsTab
      t={messages["zh-CN"]}
      isDark={false}
      chartExportTitle=""
      onChartExportTitleChange={() => {}}
      chartWatermarkText=""
      onChartWatermarkTextChange={() => {}}
      chartWatermarkImageDataUrl={null}
      chartWatermarkImageName=""
      onChartWatermarkImageFile={() => {}}
      onChartWatermarkImageClear={() => {}}
      chartSaveMetadata={false}
      onChartSaveMetadataChange={() => {}}
      chartLockEditing={false}
      onChartLockEditingChange={() => {}}
      chartIncludeGuides={true}
      onChartIncludeGuidesChange={() => {}}
      chartShowColorLabels={true}
      onChartShowColorLabelsChange={() => {}}
      chartGaplessCells={false}
      onChartGaplessCellsChange={() => {}}
      chartIncludeBoardPattern={false}
      onChartIncludeBoardPatternChange={() => {}}
      chartBoardTheme="none"
      onChartBoardThemeChange={() => {}}
      chartIncludeLegend={true}
      onChartIncludeLegendChange={() => {}}
      chartIncludeQrCode={true}
      onChartIncludeQrCodeChange={() => {}}
      chartPreviewUrl={chartPreviewUrl}
      chartPreviewError={chartPreviewError}
      chartShareCode={chartShareCode}
      chartShareLinkCopied={false}
      chartShareCodeCopied={false}
      onCopyChartShareLink={() => {}}
      onCopyChartShareCode={() => {}}
      chartPreviewBusy={false}
      chartShareQrBusy={false}
      onExportChartShareQr={() => {}}
      onSaveChart={() => {}}
      saveBusy={false}
      variant={variant}
    />,
  );
}

test("chart settings preview should show an inline error instead of the empty state when preview generation fails", () => {
  const previewError = "二维码生成失败";
  const markup = renderChartSettingsTab({ chartPreviewError: previewError });

  expect(markup).toContain(previewError);
  expect(markup).not.toContain(messages["zh-CN"].chartSettingsPreviewEmpty);
});

test("chart settings code title should keep a single-line label", () => {
  const markup = renderChartSettingsTab({});

  expect(markup).toContain(messages["zh-CN"].chartSettingsChartCode);
  expect(markup).toContain("whitespace-nowrap");
});

test("mobile chart settings should keep a fixed-height chart code text field under the actions", () => {
  const markup = renderChartSettingsTab({
    chartShareCode: "CODE-123",
    variant: "mobile-app",
  });

  expect(markup).toContain(messages["zh-CN"].chartSettingsChartCode);
  expect(markup).toContain(messages["zh-CN"].chartSettingsCopyChartCode);
  expect(markup).toContain("CODE-123");
  expect(markup).toContain("h-[88px] overflow-auto text-xs leading-5");
});

test("mobile chart settings preview should use a fixed 3:4 frame instead of sizing to chart height", () => {
  const markup = renderChartSettingsTab({
    variant: "mobile-app",
  });

  expect(markup).toContain("aspect-[3/4] w-full");
});

test("mobile landscape chart settings should switch to a two-column export layout", () => {
  expect(
    getMobileChartSettingsLayout({
      mobileApp: true,
      isLandscapeViewport: true,
    }),
  ).toEqual({
    useTwoColumn: true,
    wrapperClassName:
      "grid min-h-0 grid-cols-[minmax(270px,0.94fr)_minmax(0,1.06fr)] items-start gap-3 px-2 py-1",
    leadColumnClassName: "min-h-0 space-y-2",
    settingsColumnClassName: "min-h-0 space-y-2",
  });

  expect(
    getMobileChartSettingsLayout({
      mobileApp: true,
      isLandscapeViewport: false,
    }),
  ).toEqual({
    useTwoColumn: false,
    wrapperClassName: "flex flex-col gap-2 px-2 py-1",
    leadColumnClassName: "",
    settingsColumnClassName: "",
  });
});

test("mobile chart settings preview image should stay centered inside the fixed frame", () => {
  const mobileMarkup = renderChartSettingsTab({
    variant: "mobile-app",
    chartPreviewUrl: "https://example.com/chart.png",
  });
  const desktopMarkup = renderChartSettingsTab({
    variant: "desktop",
    chartPreviewUrl: "https://example.com/chart.png",
  });

  expect(mobileMarkup).toContain("object-contain object-center");
  expect(desktopMarkup).toContain("object-contain object-left");
});

test("mobile chart settings should keep preview and chart code in the subtle group while the remaining groups use white backgrounds", () => {
  const markup = renderChartSettingsTab({
    variant: "mobile-app",
  });

  expect(markup).toContain('data-mobile-group-tone="subtle"');
  expect(markup).toContain("border-stone-300 bg-[#f6efe2]");
  expect((markup.match(/data-mobile-group-tone="plain"/g) ?? []).length).toBe(2);
});

test("mobile chart settings preview and chart code surfaces should keep the subtle background tone", () => {
  const markup = renderChartSettingsTab({
    variant: "mobile-app",
  });

  expect(markup).toContain('data-mobile-export-surface="preview"');
  expect(markup).toContain('data-mobile-export-surface="chart-code"');
  expect(markup).toContain("bg-[#faf4e9]");
  expect(markup).not.toContain("data-mobile-export-surface=\"preview\" class=\"relative flex aspect-[3/4] w-full flex-none items-center justify-center overflow-hidden rounded-[16px] bg-white/65\"");
  expect(markup).not.toContain("data-mobile-export-surface=\"chart-code\" class=\"h-[88px] overflow-auto text-xs leading-5 rounded-md border px-3 py-2 shadow-inner transition border-stone-300 bg-[#f6efe2] text-stone-800\"");
});

test("desktop chart settings preview panels should also use the softened export background", () => {
  const markup = renderChartSettingsTab({
    variant: "desktop",
  });

  expect(markup).toContain("border-stone-300 bg-[#f6efe2]");
});
