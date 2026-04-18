import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChartSettingsTab } from "../src/components/chart-settings-tab";
import { messages } from "../src/lib/i18n";

function renderChartSettingsTab(chartPreviewError: string | null) {
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
      chartPreviewUrl={null}
      chartPreviewError={chartPreviewError}
      chartShareCode=""
      chartShareLinkCopied={false}
      chartShareCodeCopied={false}
      onCopyChartShareLink={() => {}}
      onCopyChartShareCode={() => {}}
      chartPreviewBusy={false}
      chartShareQrBusy={false}
      onExportChartShareQr={() => {}}
      onSaveChart={() => {}}
      saveBusy={false}
    />,
  );
}

test("chart settings preview should show an inline error instead of the empty state when preview generation fails", () => {
  const markup = renderChartSettingsTab("二维码生成失败");

  expect(markup).toContain("二维码生成失败");
  expect(markup).not.toContain(messages["zh-CN"].chartSettingsPreviewEmpty);
});

test("chart settings code title should keep a single-line label", () => {
  const markup = renderChartSettingsTab(null);

  expect(markup).toContain("图纸码");
  expect(markup).toContain("whitespace-nowrap");
});
