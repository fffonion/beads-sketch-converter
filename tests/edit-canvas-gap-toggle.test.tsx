import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EditModeWorkspace } from "../src/components/pixel-editor-panel";
import { messages } from "../src/lib/i18n";

function withViewport<T>(width: number, height: number, run: () => T) {
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    value: {
      innerWidth: width,
      innerHeight: height,
    },
    configurable: true,
    writable: true,
  });
  try {
    return run();
  } finally {
    if (originalWindow === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (globalThis as typeof globalThis & { window?: Window }).window;
    } else {
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    }
  }
}

function renderEditModeWorkspace({
  mobileApp,
  viewport,
}: {
  mobileApp: boolean;
  viewport: { width: number; height: number };
}) {
  return withViewport(viewport.width, viewport.height, () =>
    renderToStaticMarkup(
      <EditModeWorkspace
        t={messages["en-US"]}
        isDark={false}
        cells={[
          { label: "A1", hex: "#111111" },
          { label: "B2", hex: "#ffffff" },
          { label: null, hex: null },
          { label: "A1", hex: "#111111" },
        ]}
        gridWidth={2}
        gridHeight={2}
        inputUrl={null}
        overlayCropRect={null}
        overlayEnabled={false}
        onOverlayEnabledChange={() => {}}
        fillTolerance={16}
        onFillToleranceChange={() => {}}
        brushSize={1}
        onBrushSizeChange={() => {}}
        editTool="paint"
        onEditToolChange={() => {}}
        editZoom={1}
        onEditZoomChange={() => {}}
        editFlipHorizontal={false}
        onEditFlipHorizontalChange={() => {}}
        editGaplessCells={true}
        onEditGaplessCellsChange={() => {}}
        selectedLabel="A1"
        selectedHex="#111111"
        colorSystemId="mard_221"
        onColorSystemIdChange={() => {}}
        paletteOptions={[
          { label: "A1", hex: "#111111" },
          { label: "B2", hex: "#ffffff" },
        ]}
        onSelectedLabelChange={() => {}}
        onApplyCell={() => {}}
        canvasCropSelection={null}
        onCanvasCropSelectionChange={() => {}}
        onCanvasCropConfirm={() => {}}
        onCanvasCropCancel={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
        canUndo={true}
        canRedo={true}
        paintActiveRef={{ current: false }}
        matchedColors={[
          { label: "A1", count: 2, hex: "#111111" },
          { label: "B2", count: 1, hex: "#ffffff" },
        ]}
        disabledResultLabels={[]}
        matchedCoveragePercent={100}
        onMatchedCoveragePercentChange={() => {}}
        onToggleMatchedColor={() => {}}
        onReplaceMatchedColor={() => {}}
        stageBusy={false}
        mobileApp={mobileApp}
      />,
    ),
  );
}

test("edit canvas gap toggle should render in the desktop edit toolbar", () => {
  const markup = renderEditModeWorkspace({
    mobileApp: false,
    viewport: { width: 1280, height: 900 },
  });

  expect(markup).toContain('data-edit-cell-gap-toggle="true"');
  expect(markup).toContain("Hide Cell Gaps");
  expect(markup).toContain('aria-pressed="true"');
});

test("edit canvas gap toggle should stay present in the mobile portrait edit toolbar", () => {
  const markup = renderEditModeWorkspace({
    mobileApp: true,
    viewport: { width: 390, height: 844 },
  });

  expect(markup).toContain('data-edit-cell-gap-toggle="true"');
  expect(markup).toContain("Hide Cell Gaps");
});

test("edit canvas gap toggle should stay present in the mobile landscape edit toolbar", () => {
  const markup = renderEditModeWorkspace({
    mobileApp: true,
    viewport: { width: 844, height: 390 },
  });

  expect(markup).toContain('data-edit-cell-gap-toggle="true"');
  expect(markup).toContain("Hide Cell Gaps");
  expect((markup.match(/data-edit-toolbar-row="true"/g) ?? []).length).toBe(1);
});
