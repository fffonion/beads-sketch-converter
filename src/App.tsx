import clsx from "clsx";
import { ImageUp, Shapes } from "lucide-react";
import { startTransition, useEffect, useRef, useState } from "react";
import { LanguageSwitch, ThemeSwitch } from "./components/controls";
import { SidebarPanel } from "./components/sidebar-panel";
import { WorkspacePanels } from "./components/workspace-panels";
import { defaultLocale, getMessages, type Locale } from "./lib/i18n";
import {
  exportChartFromCells,
  getPaletteOptions,
  measureHexDistance255,
  processImageFile,
  type EditableCell,
  type NormalizedCropRect,
  type ProcessResult,
} from "./lib/mard";
import { getThemeClasses, type ThemeMode } from "./lib/theme";

type GridMode = "auto" | "manual";
type GridAxis = "width" | "height";
type EditTool = "paint" | "erase" | "pick" | "fill";

const localeStorageKey = "pindou-convert-locale";
const themeStorageKey = "pindou-convert-theme";

function readInitialLocale(): Locale {
  if (typeof window === "undefined") {
    return defaultLocale;
  }

  const stored = window.localStorage.getItem(localeStorageKey);
  return stored === "en-US" || stored === "zh-CN" ? stored : defaultLocale;
}

function readInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem(themeStorageKey);
  return stored === "light" || stored === "dark" || stored === "system"
    ? stored
    : "system";
}

export default function App() {
  const runIdRef = useRef(0);
  const paintActiveRef = useRef(false);
  const sourceMetaRunIdRef = useRef(0);
  const editorHistoryRef = useRef<EditableCell[][]>([]);
  const editorHistoryIndexRef = useRef(-1);
  const inputUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  const [locale, setLocale] = useState<Locale>(readInitialLocale);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readInitialThemeMode);
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [inputUrl, setInputUrl] = useState<string | null>(null);
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [sourceComplexity, setSourceComplexity] = useState(52);
  const [cropRect, setCropRect] = useState<NormalizedCropRect | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const [result, setResult] = useState<(ProcessResult & { url: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [gridMode, setGridMode] = useState<GridMode>("auto");
  const [colorSystemId, setColorSystemId] = useState("mard_221");
  const [gridWidth, setGridWidth] = useState("33");
  const [gridHeight, setGridHeight] = useState("33");
  const [manualLastEditedAxis, setManualLastEditedAxis] = useState<GridAxis>("width");
  const [followSourceRatio, setFollowSourceRatio] = useState(true);
  const [reduceColors, setReduceColors] = useState(true);
  const [reduceTolerance, setReduceTolerance] = useState(16);
  const [preSharpen, setPreSharpen] = useState(true);
  const [preSharpenStrength, setPreSharpenStrength] = useState(20);
  const [editTool, setEditTool] = useState<EditTool>("paint");
  const [brushSize, setBrushSize] = useState(1);
  const [fillTolerance, setFillTolerance] = useState(16);
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [disabledResultLabels, setDisabledResultLabels] = useState<string[]>([]);
  const [editorHistory, setEditorHistory] = useState<EditableCell[][]>([]);
  const [editorHistoryIndex, setEditorHistoryIndex] = useState(-1);

  const paletteOptions = getPaletteOptions(colorSystemId);
  const [selectedLabel, setSelectedLabel] = useState<string>(paletteOptions[0]?.label ?? "A1");

  const t = getMessages(locale);
  const isDark = themeMode === "dark" || (themeMode === "system" && systemPrefersDark);
  const theme = getThemeClasses(isDark);
  const activeAspectRatio = getActiveAspectRatio(sourceSize, cropMode ? cropRect : null);
  const topError = error;
  const editorBaseCells =
    editorHistoryIndex >= 0 ? editorHistory[editorHistoryIndex] ?? [] : result?.cells ?? [];
  const renderedEditorCells = getRenderedEditableCells(
    editorBaseCells,
    disabledResultLabels,
    paletteOptions,
  );
  const baseMatchedColors = summarizeMatchedColors(editorBaseCells, paletteOptions);
  const renderedMatchedColors = summarizeMatchedColors(renderedEditorCells, paletteOptions);
  const displayMatchedColors = mergeDisplayMatchedColors(
    baseMatchedColors,
    renderedMatchedColors,
  );
  const matchedCoveragePercent = getMatchedCoveragePercent(
    baseMatchedColors,
    disabledResultLabels,
  );

  function handleGridWidthChange(value: string) {
    setGridWidth(value);
    setManualLastEditedAxis("width");
    if (!followSourceRatio || !activeAspectRatio) {
      return;
    }

    const parsedWidth = Number.parseInt(value, 10);
    if (!Number.isFinite(parsedWidth) || parsedWidth <= 0) {
      return;
    }
    setGridHeight(String(Math.max(1, Math.round(parsedWidth / activeAspectRatio))));
  }

  function handleGridHeightChange(value: string) {
    setGridHeight(value);
    setManualLastEditedAxis("height");
    if (!followSourceRatio || !activeAspectRatio) {
      return;
    }

    const parsedHeight = Number.parseInt(value, 10);
    if (!Number.isFinite(parsedHeight) || parsedHeight <= 0) {
      return;
    }
    setGridWidth(String(Math.max(1, Math.round(parsedHeight * activeAspectRatio))));
  }

  function applyManualFallbackGrid() {
    const ratio = activeAspectRatio ?? 1;
    const defaultGridBase = sourceComplexity;
    setFollowSourceRatio(true);

    if (ratio >= 1) {
      setManualLastEditedAxis("width");
      setGridWidth(String(defaultGridBase));
      setGridHeight(String(Math.max(1, Math.round(defaultGridBase / ratio))));
      return;
    }

    setManualLastEditedAxis("height");
    setGridHeight(String(defaultGridBase));
    setGridWidth(String(Math.max(1, Math.round(defaultGridBase * ratio))));
  }

  function handleFileSelection(nextFile: File | null) {
    sourceMetaRunIdRef.current += 1;
    setError(null);
    setCropRect(null);
    setCropMode(false);
    setSourceSize(null);
    setSourceComplexity(52);
    setDisabledResultLabels([]);
    editorHistoryRef.current = [];
    editorHistoryIndexRef.current = -1;
    setEditorHistory([]);
    setEditorHistoryIndex(-1);

    if (result?.url) {
      URL.revokeObjectURL(result.url);
      setResult(null);
    }

    if (inputUrl) {
      URL.revokeObjectURL(inputUrl);
      setInputUrl(null);
      inputUrlRef.current = null;
    }

    setFile(nextFile);
    if (!nextFile) {
      return;
    }

    const nextInputUrl = URL.createObjectURL(nextFile);
    setInputUrl(nextInputUrl);
    inputUrlRef.current = nextInputUrl;
    const sourceMetaRunId = sourceMetaRunIdRef.current;
    void loadImageMetadata(nextFile).then((nextMetadata) => {
      if (sourceMetaRunIdRef.current !== sourceMetaRunId) {
        return;
      }
      setSourceSize({
        width: nextMetadata.width,
        height: nextMetadata.height,
      });
      setSourceComplexity(nextMetadata.complexity);
    });
  }

  async function refreshEditedChart(
    nextCells: EditableCell[],
    disabledLabelsOverride?: string[],
  ) {
    if (!result) {
      return;
    }

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setBusy(true);
    setError(null);

    try {
      const renderedCells = applyDisabledColorReplacements(
        nextCells,
        disabledLabelsOverride ?? disabledResultLabels,
        paletteOptions,
      );
      const exported = await exportChartFromCells({
        cells: renderedCells,
        gridWidth: result.gridWidth,
        gridHeight: result.gridHeight,
        fileName: result.fileName,
        colorSystemId,
        messages: {
          canvasContextUnavailable: t.errorCanvasContextUnavailable,
          encodingFailed: t.errorEncodingFailed,
          chartTitle: t.chartTitle,
        },
      });

      if (runIdRef.current !== runId) {
        return;
      }

      const url = URL.createObjectURL(exported.blob);
      setResult((previous) => {
        if (!previous) {
          URL.revokeObjectURL(url);
          return previous;
        }
        if (previous.url) {
          URL.revokeObjectURL(previous.url);
        }
        return {
          ...previous,
          ...exported,
          cells: renderedCells,
          url,
        };
      });
    } catch (processingError) {
      if (runIdRef.current !== runId) {
        return;
      }
      setError(
        processingError instanceof Error ? processingError.message : t.processingFailed,
      );
    } finally {
      if (runIdRef.current === runId) {
        setBusy(false);
      }
    }
  }

  function resetEditorHistory(cells: EditableCell[]) {
    const snapshot = cloneEditableCells(cells);
    editorHistoryRef.current = [snapshot];
    editorHistoryIndexRef.current = 0;
    setEditorHistory([snapshot]);
    setEditorHistoryIndex(0);
  }

  function commitEditorSnapshot(nextCells: EditableCell[]) {
    const snapshot = cloneEditableCells(nextCells);
    const base = editorHistoryRef.current.slice(0, editorHistoryIndexRef.current + 1);
    base.push(snapshot);
    editorHistoryRef.current = base;
    editorHistoryIndexRef.current = base.length - 1;
    setEditorHistory(base);
    setEditorHistoryIndex(base.length - 1);
    void refreshEditedChart(snapshot);
  }

  function handleUndo() {
    if (editorHistoryIndexRef.current <= 0) {
      return;
    }
    const nextIndex = editorHistoryIndexRef.current - 1;
    const snapshot = editorHistoryRef.current[nextIndex];
    if (!snapshot) {
      return;
    }
    editorHistoryIndexRef.current = nextIndex;
    setEditorHistoryIndex(nextIndex);
    void refreshEditedChart(cloneEditableCells(snapshot));
  }

  function handleRedo() {
    if (
      editorHistoryIndexRef.current < 0 ||
      editorHistoryIndexRef.current >= editorHistoryRef.current.length - 1
    ) {
      return;
    }
    const nextIndex = editorHistoryIndexRef.current + 1;
    const snapshot = editorHistoryRef.current[nextIndex];
    if (!snapshot) {
      return;
    }
    editorHistoryIndexRef.current = nextIndex;
    setEditorHistoryIndex(nextIndex);
    void refreshEditedChart(cloneEditableCells(snapshot));
  }

  function applyDisabledResultLabels(nextDisabledLabels: string[]) {
    setDisabledResultLabels(nextDisabledLabels);

    if (editorBaseCells.length > 0) {
      void refreshEditedChart(cloneEditableCells(editorBaseCells), nextDisabledLabels);
    }
  }

  function toggleDisabledMatchedColor(label: string) {
    const nextDisabledLabels = disabledResultLabels.includes(label)
      ? disabledResultLabels.filter((entry) => entry !== label)
      : [...disabledResultLabels, label];
    applyDisabledResultLabels(nextDisabledLabels);
  }

  function handleMatchedCoveragePercentChange(value: number) {
    const nextDisabledLabels = buildDisabledLabelsByCoverage(baseMatchedColors, value);
    applyDisabledResultLabels(nextDisabledLabels);
  }

  function applyCellEdit(index: number) {
    if (!result || !editorBaseCells.length) {
      return;
    }

    if (editTool === "pick") {
      const picked = renderedEditorCells[index];
      if (picked?.label) {
        setSelectedLabel(picked.label);
        setEditTool("paint");
      } else {
        setSelectedLabel("H2");
        setEditTool("erase");
      }
      return;
    }

    const replacement = buildReplacementCell(selectedLabel, paletteOptions, editTool);
    const nextCells =
      editTool === "fill"
        ? floodFillCells(
            editorBaseCells,
            result.gridWidth,
            result.gridHeight,
            index,
            replacement,
            fillTolerance,
          )
        : replaceBrushArea(
            editorBaseCells,
            result.gridWidth,
            result.gridHeight,
            index,
            replacement,
            brushSize,
          );

    if (cellsEqual(editorBaseCells, nextCells)) {
      return;
    }

    commitEditorSnapshot(nextCells);
  }

  useEffect(() => {
    if (gridMode !== "manual") {
      return;
    }

    const parsedWidth = Number.parseInt(gridWidth, 10);
    const parsedHeight = Number.parseInt(gridHeight, 10);
    if (Number.isFinite(parsedWidth) && parsedWidth === 33 && Number.isFinite(parsedHeight) && parsedHeight === 33) {
      applyManualFallbackGrid();
    }
  }, [gridMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (matches: boolean) => setSystemPrefersDark(matches);
    apply(media.matches);

    const listener = (event: MediaQueryListEvent) => apply(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem(localeStorageKey, locale);
  }, [locale]);

  useEffect(() => {
    window.localStorage.setItem(themeStorageKey, themeMode);
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  }, [themeMode, isDark]);

  useEffect(() => {
    resultUrlRef.current = result?.url ?? null;
  }, [result?.url]);

  useEffect(() => {
    return () => {
      if (inputUrlRef.current) {
        URL.revokeObjectURL(inputUrlRef.current);
      }
      if (resultUrlRef.current) {
        URL.revokeObjectURL(resultUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handlePointerUp = () => {
      paintActiveRef.current = false;
    };

    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    setSelectedLabel((previous) => {
      if (paletteOptions.some((entry) => entry.label === previous)) {
        return previous;
      }
      return paletteOptions[0]?.label ?? previous;
    });
  }, [colorSystemId]);

  useEffect(() => {
    if (gridMode !== "manual" || !followSourceRatio || !activeAspectRatio) {
      return;
    }

    if (manualLastEditedAxis === "width") {
      const parsedWidth = Number.parseInt(gridWidth, 10);
      if (!Number.isFinite(parsedWidth) || parsedWidth <= 0) {
        return;
      }
      setGridHeight((previous) => {
        const next = String(Math.max(1, Math.round(parsedWidth / activeAspectRatio)));
        return previous === next ? previous : next;
      });
      return;
    }

    const parsedHeight = Number.parseInt(gridHeight, 10);
    if (!Number.isFinite(parsedHeight) || parsedHeight <= 0) {
      return;
    }
    setGridWidth((previous) => {
      const next = String(Math.max(1, Math.round(parsedHeight * activeAspectRatio)));
      return previous === next ? previous : next;
    });
  }, [
    gridMode,
    followSourceRatio,
    activeAspectRatio,
    manualLastEditedAxis,
    gridWidth,
    gridHeight,
  ]);

  useEffect(() => {
    if (!file) {
      setBusy(false);
      setError(null);
      setDisabledResultLabels([]);
      editorHistoryRef.current = [];
      editorHistoryIndexRef.current = -1;
      setEditorHistory([]);
      setEditorHistoryIndex(-1);
      setResult((previous) => {
        if (previous?.url) {
          URL.revokeObjectURL(previous.url);
        }
        return null;
      });
      return;
    }

    const manualWidth = Number.parseInt(gridWidth, 10);
    const manualHeight = Number.parseInt(gridHeight, 10);
    if (
      gridMode === "manual" &&
      (!Number.isFinite(manualWidth) ||
        !Number.isFinite(manualHeight) ||
        manualWidth <= 0 ||
        manualHeight <= 0)
    ) {
      setError(t.manualGridValidation);
      setBusy(false);
      setDisabledResultLabels([]);
      editorHistoryRef.current = [];
      editorHistoryIndexRef.current = -1;
      setEditorHistory([]);
      setEditorHistoryIndex(-1);
      setResult((previous) => {
        if (previous?.url) {
          URL.revokeObjectURL(previous.url);
        }
        return null;
      });
      return;
    }

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setBusy(true);
        setError(null);

        try {
          const processed = await processImageFile(file, {
            colorSystemId,
            gridMode,
            gridWidth: gridMode === "manual" ? manualWidth : undefined,
            gridHeight: gridMode === "manual" ? manualHeight : undefined,
            cropRect: cropMode ? cropRect : null,
            reduceColors,
            reduceTolerance,
            preSharpen,
            preSharpenStrength,
            messages: {
              nonPixelArtError: t.errorNonPixelArt,
              manualGridRequired: t.errorManualGridRequired,
              canvasContextUnavailable: t.errorCanvasContextUnavailable,
              encodingFailed: t.errorEncodingFailed,
              chartTitle: t.chartTitle,
            },
          });

          if (runIdRef.current !== runId) {
            return;
          }

          const url = URL.createObjectURL(processed.blob);
          setDisabledResultLabels([]);
          startTransition(() => {
            setResult((previous) => {
              if (previous?.url) {
                URL.revokeObjectURL(previous.url);
              }
              return { ...processed, url };
            });
          });
          resetEditorHistory(processed.cells);

          if (processed.colors[0]?.label) {
            setSelectedLabel((previous) =>
              paletteOptions.some((entry) => entry.label === previous)
                ? previous
                : processed.colors[0].label,
            );
          }
        } catch (processingError) {
          if (runIdRef.current !== runId) {
            return;
          }

          if (
            gridMode === "auto" &&
            processingError instanceof Error &&
            processingError.message === t.errorNonPixelArt
          ) {
            setGridMode("manual");
            applyManualFallbackGrid();
          }

          setResult((previous) => {
            if (previous?.url) {
              URL.revokeObjectURL(previous.url);
            }
            return null;
          });
          setDisabledResultLabels([]);
          editorHistoryRef.current = [];
          editorHistoryIndexRef.current = -1;
          setEditorHistory([]);
          setEditorHistoryIndex(-1);
          setError(
            processingError instanceof Error ? processingError.message : t.processingFailed,
          );
        } finally {
          if (runIdRef.current === runId) {
            setBusy(false);
          }
        }
      })();
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    file,
    colorSystemId,
    gridMode,
    gridWidth,
    gridHeight,
    reduceColors,
    reduceTolerance,
    preSharpen,
    preSharpenStrength,
    cropMode,
    cropRect,
    locale,
  ]);

  return (
    <main className={clsx("min-h-screen transition-colors", theme.page)}>
      <div className="mx-auto max-w-[1600px] px-4 pt-3 sm:pt-4 lg:px-6 lg:pt-6">
        <div className="flex flex-col gap-3 sm:gap-4 xl:flex-row xl:items-stretch xl:justify-between">
          <div className={clsx("min-w-0 rounded-[10px] border px-3 py-2 backdrop-blur transition-colors sm:px-4 xl:flex-1", theme.controlShell)}>
            <div className="flex min-w-0 flex-col gap-2 xl:h-full xl:flex-row xl:items-center xl:gap-4">
              <div className="flex shrink-0 items-center gap-3">
                <div className={clsx("flex h-9 w-9 items-center justify-center rounded-[8px] border", theme.pill)}>
                  <Shapes className="h-4.5 w-4.5" />
                </div>
                <h1 className={clsx("font-['Iowan_Old_Style','Palatino_Linotype',Georgia,serif] text-xl leading-none sm:text-2xl", theme.cardTitle)}>
                  {t.appTitle}
                </h1>
              </div>
            </div>
          </div>

          <div className="flex max-w-full flex-wrap items-stretch justify-end gap-2 xl:shrink-0">
            <ThemeSwitch
              themeLabel={t.themeLabel}
              themeMode={themeMode}
              setThemeMode={setThemeMode}
              isDark={isDark}
            />
            <LanguageSwitch
              languageLabel={t.languageLabel}
              chineseLabel={t.languageChinese}
              englishLabel={t.languageEnglish}
              locale={locale}
              setLocale={setLocale}
              isDark={isDark}
            />
          </div>
        </div>
      </div>

      {topError ? (
        <div className="mx-auto max-w-[1600px] px-4 pt-3 lg:px-6">
          <div className={clsx("rounded-[10px] border px-4 py-3 text-sm", theme.errorBox)}>
            {topError}
          </div>
        </div>
      ) : null}

      {!file ? (
        <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-[1600px] items-center justify-center px-4 pb-8 pt-6 lg:px-6">
          <section className={clsx("w-full max-w-[640px] rounded-[14px] border p-6 text-center backdrop-blur transition-colors sm:p-8", theme.panel)}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[10px] border sm:h-16 sm:w-16" >
              <ImageUp className={clsx("h-6 w-6 sm:h-7 sm:w-7", theme.cardTitle)} />
            </div>
            <h2 className={clsx("mt-5 font-['Iowan_Old_Style','Palatino_Linotype',Georgia,serif] text-2xl sm:text-3xl", theme.cardTitle)}>
              {t.sourceChooseImage}
            </h2>
            <p className={clsx("mx-auto mt-3 max-w-[34rem] text-sm leading-6 sm:text-base", theme.cardMuted)}>
              {t.sourceStayInTab}
            </p>
            <p className={clsx("mt-2 text-xs sm:text-sm", theme.cardMuted)}>
              {t.sourceSubtitle}
            </p>
            <p className={clsx("mt-2 text-xs", theme.cardMuted)}>
              {t.sourcePrivacyNote}
            </p>

            <label className={clsx("mx-auto mt-6 flex max-w-[320px] cursor-pointer items-center justify-center gap-2 rounded-md border px-5 py-3 text-sm font-semibold transition", theme.primaryButton)}>
              <ImageUp className="h-4 w-4" />
              <span>{t.sourceChooseImage}</span>
              <input
                className="hidden"
                type="file"
                accept="image/*"
                onChange={(event) => handleFileSelection(event.target.files?.[0] ?? null)}
              />
            </label>
          </section>
        </div>
      ) : (
        <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-[1600px] gap-4 px-4 pb-6 pt-4 xl:grid-cols-[420px_minmax(0,1fr)] xl:gap-6 lg:px-6 lg:pt-4">
          <SidebarPanel
            t={t}
            file={file}
            inputUrl={inputUrl}
            cropMode={cropMode}
            onCropModeChange={setCropMode}
            cropRect={cropRect}
            onCropChange={setCropRect}
            busy={busy}
            isDark={isDark}
            colorSystemId={colorSystemId}
            onColorSystemIdChange={setColorSystemId}
            gridMode={gridMode}
            onGridModeChange={setGridMode}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            onGridWidthChange={handleGridWidthChange}
            onGridHeightChange={handleGridHeightChange}
            followSourceRatio={followSourceRatio}
            onFollowSourceRatioChange={setFollowSourceRatio}
            reduceColors={reduceColors}
            onReduceColorsChange={setReduceColors}
            reduceTolerance={reduceTolerance}
            onReduceToleranceChange={setReduceTolerance}
            preSharpen={preSharpen}
            onPreSharpenChange={setPreSharpen}
            preSharpenStrength={preSharpenStrength}
            onPreSharpenStrengthChange={setPreSharpenStrength}
            onFileSelection={handleFileSelection}
          />

          <WorkspacePanels
            t={t}
            inputUrl={inputUrl}
            cropRect={cropRect}
            result={result}
            isDark={isDark}
            editTool={editTool}
            onEditToolChange={setEditTool}
            overlayEnabled={overlayEnabled}
            onOverlayEnabledChange={setOverlayEnabled}
            fillTolerance={fillTolerance}
            onFillToleranceChange={setFillTolerance}
            brushSize={brushSize}
            onBrushSizeChange={setBrushSize}
            disabledResultLabels={disabledResultLabels}
            matchedColorsBase={displayMatchedColors}
            matchedCoveragePercent={matchedCoveragePercent}
            onMatchedCoveragePercentChange={handleMatchedCoveragePercentChange}
            onToggleMatchedColor={toggleDisabledMatchedColor}
            selectedLabel={selectedLabel}
            onSelectedLabelChange={setSelectedLabel}
            paletteOptions={paletteOptions}
            currentCells={renderedEditorCells}
            onApplyCell={applyCellEdit}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={editorHistoryIndex > 0}
            canRedo={editorHistoryIndex >= 0 && editorHistoryIndex < editorHistory.length - 1}
            paintActiveRef={paintActiveRef}
          />
        </div>
      )}
    </main>
  );
}

function getActiveAspectRatio(
  sourceSize: { width: number; height: number } | null,
  cropRect: NormalizedCropRect | null,
) {
  if (!sourceSize || sourceSize.width <= 0 || sourceSize.height <= 0) {
    return null;
  }

  if (!cropRect) {
    return sourceSize.width / sourceSize.height;
  }

  const cropWidth = sourceSize.width * cropRect.width;
  const cropHeight = sourceSize.height * cropRect.height;
  if (cropWidth <= 0 || cropHeight <= 0) {
    return sourceSize.width / sourceSize.height;
  }

  return cropWidth / cropHeight;
}

async function loadImageMetadata(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const complexity = estimateImageComplexity(bitmap);
    return {
      width: bitmap.width,
      height: bitmap.height,
      complexity,
    };
  } finally {
    bitmap.close();
  }
}

function estimateImageComplexity(bitmap: ImageBitmap) {
  const sampleMaxSide = 128;
  const scale = Math.min(1, sampleMaxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(8, Math.round(bitmap.width * scale));
  const height = Math.max(8, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return 52;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height).data;
  const grayscale = new Float32Array(width * height);
  let sum = 0;

  for (let index = 0; index < width * height; index += 1) {
    const pixelIndex = index * 4;
    const value =
      imageData[pixelIndex] * 0.299 +
      imageData[pixelIndex + 1] * 0.587 +
      imageData[pixelIndex + 2] * 0.114;
    grayscale[index] = value;
    sum += value;
  }

  const mean = sum / grayscale.length;
  let variance = 0;
  let edgeEnergy = 0;
  const bins = new Uint16Array(16);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const value = grayscale[index];
      const delta = value - mean;
      variance += delta * delta;
      bins[Math.min(15, Math.floor(value / 16))] += 1;

      if (x + 1 < width) {
        edgeEnergy += Math.abs(value - grayscale[index + 1]);
      }
      if (y + 1 < height) {
        edgeEnergy += Math.abs(value - grayscale[index + width]);
      }
    }
  }

  variance /= grayscale.length;
  const normalizedVariance = Math.min(1, Math.sqrt(variance) / 80);
  const normalizedEdges = Math.min(1, edgeEnergy / Math.max(1, (width * (height - 1) + height * (width - 1)) * 36));

  let entropy = 0;
  for (const count of bins) {
    if (count === 0) {
      continue;
    }
    const probability = count / grayscale.length;
    entropy -= probability * Math.log2(probability);
  }
  const normalizedEntropy = Math.min(1, entropy / 4);

  const score = normalizedEdges * 0.5 + normalizedVariance * 0.3 + normalizedEntropy * 0.2;
  return Math.max(30, Math.min(100, Math.round(30 + score * 70)));
}

function cloneEditableCells(cells: EditableCell[]) {
  return cells.map((cell) => ({ ...cell }));
}

function cellsEqual(left: EditableCell[], right: EditableCell[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.label !== right[index]?.label || left[index]?.hex !== right[index]?.hex) {
      return false;
    }
  }

  return true;
}

function buildReplacementCell(
  selectedLabel: string,
  paletteOptions: Array<{ label: string; hex: string }>,
  tool: EditTool,
): EditableCell {
  if (tool === "erase") {
    return { label: null, hex: null };
  }

  const selected = paletteOptions.find((entry) => entry.label === selectedLabel);
  if (!selected || selected.label === "H2") {
    return { label: null, hex: null };
  }

  return { label: selected.label, hex: selected.hex };
}

function replaceSingleCell(
  cells: EditableCell[],
  index: number,
  replacement: EditableCell,
) {
  return cells.map((cell, cellIndex) =>
    cellIndex === index ? { ...replacement } : { ...cell },
  );
}

function replaceBrushArea(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
  index: number,
  replacement: EditableCell,
  brushSize: number,
) {
  const normalizedSize = Math.max(1, Math.min(24, Math.round(brushSize)));
  if (normalizedSize === 1) {
    return replaceSingleCell(cells, index, replacement);
  }

  const targetX = index % gridWidth;
  const targetY = Math.floor(index / gridWidth);
  const startX = targetX - Math.floor(normalizedSize / 2);
  const startY = targetY - Math.floor(normalizedSize / 2);
  const nextCells = cloneEditableCells(cells);

  for (let offsetY = 0; offsetY < normalizedSize; offsetY += 1) {
    for (let offsetX = 0; offsetX < normalizedSize; offsetX += 1) {
      const x = startX + offsetX;
      const y = startY + offsetY;
      if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) {
        continue;
      }

      nextCells[y * gridWidth + x] = { ...replacement };
    }
  }

  return nextCells;
}

function floodFillCells(
  cells: EditableCell[],
  gridWidth: number,
  gridHeight: number,
  startIndex: number,
  replacement: EditableCell,
  threshold: number,
) {
  const startCell = cells[startIndex];
  if (!startCell) {
    return cells;
  }

  if (
    startCell.label === replacement.label &&
    startCell.hex === replacement.hex
  ) {
    return cells;
  }

  const nextCells = cloneEditableCells(cells);
  const visited = new Uint8Array(cells.length);
  const queue: number[] = [startIndex];
  visited[startIndex] = 1;

  while (queue.length > 0) {
    const currentIndex = queue.pop()!;
    const currentCell = cells[currentIndex];
    const distance = measureHexDistance255(startCell.hex, currentCell?.hex ?? null);
    if (distance > threshold) {
      continue;
    }

    nextCells[currentIndex] = { ...replacement };

    const x = currentIndex % gridWidth;
    const y = Math.floor(currentIndex / gridWidth);
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];

    for (const [neighborX, neighborY] of neighbors) {
      if (
        neighborX < 0 ||
        neighborY < 0 ||
        neighborX >= gridWidth ||
        neighborY >= gridHeight
      ) {
        continue;
      }

      const neighborIndex = neighborY * gridWidth + neighborX;
      if (visited[neighborIndex]) {
        continue;
      }
      visited[neighborIndex] = 1;
      queue.push(neighborIndex);
    }
  }

  return nextCells;
}

function summarizeMatchedColors(
  cells: EditableCell[],
  paletteOptions: Array<{ label: string; hex: string }>,
) {
  const counts = new Map<string, number>();
  for (const cell of cells) {
    if (!cell.label || !cell.hex) {
      continue;
    }
    counts.set(cell.label, (counts.get(cell.label) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      hex: paletteOptions.find((entry) => entry.label === label)?.hex ?? "#000000",
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function mergeDisplayMatchedColors(
  baseColors: Array<{ label: string; count: number; hex: string }>,
  renderedColors: Array<{ label: string; count: number; hex: string }>,
) {
  const renderedMap = new Map(renderedColors.map((entry) => [entry.label, entry]));
  const merged: Array<{ label: string; count: number; hex: string }> = [];
  const seen = new Set<string>();

  for (const entry of baseColors) {
    const rendered = renderedMap.get(entry.label);
    merged.push({
      label: entry.label,
      count: rendered?.count ?? 0,
      hex: rendered?.hex ?? entry.hex,
    });
    seen.add(entry.label);
  }

  for (const entry of renderedColors) {
    if (seen.has(entry.label)) {
      continue;
    }
    merged.push(entry);
  }

  return merged;
}

function getMatchedCoveragePercent(
  baseColors: Array<{ label: string; count: number; hex: string }>,
  disabledLabels: string[],
) {
  const totalCount = baseColors.length;
  if (totalCount <= 0) {
    return 100;
  }

  const disabledSet = new Set(disabledLabels);
  const activeCount = baseColors.reduce((sum, entry) => sum + (disabledSet.has(entry.label) ? 0 : 1), 0);
  return Math.max(0, Math.min(100, Math.round((activeCount / totalCount) * 100)));
}

function buildDisabledLabelsByCoverage(
  baseColors: Array<{ label: string; count: number; hex: string }>,
  targetPercent: number,
) {
  if (baseColors.length <= 1) {
    return [];
  }

  const clampedPercent = Math.max(0, Math.min(100, targetPercent));
  if (clampedPercent >= 100) {
    return [];
  }

  const totalCount = baseColors.length;
  if (totalCount <= 0) {
    return [];
  }

  const targetActiveCount = Math.max(1, Math.round((totalCount * clampedPercent) / 100));
  const sortedColors = [...baseColors].sort(
    (left, right) => left.count - right.count || left.label.localeCompare(right.label),
  );

  const disabledLabels: string[] = [];
  let remainingColorCount = sortedColors.length;

  for (const entry of sortedColors) {
    if (remainingColorCount <= 1) {
      break;
    }
    if (remainingColorCount - 1 < targetActiveCount) {
      break;
    }

    disabledLabels.push(entry.label);
    remainingColorCount -= 1;
  }

  return disabledLabels;
}

function getRenderedEditableCells(
  cells: EditableCell[],
  disabledLabels: string[],
  paletteOptions: Array<{ label: string; hex: string }>,
) {
  if (!cells.length) {
    return [];
  }

  if (!disabledLabels.length) {
    return cloneEditableCells(cells);
  }

  return applyDisabledColorReplacements(cells, disabledLabels, paletteOptions);
}

function applyDisabledColorReplacements(
  cells: EditableCell[],
  disabledLabels: string[],
  paletteOptions: Array<{ label: string; hex: string }>,
) {
  if (!disabledLabels.length) {
    return cloneEditableCells(cells);
  }

  const paletteMap = new Map(paletteOptions.map((entry) => [entry.label, entry.hex]));
  const usedLabels = summarizeMatchedColors(cells, paletteOptions).map((entry) => entry.label);
  const activeUsedLabels = usedLabels.filter((label) => !disabledLabels.includes(label));
  const replacementMap = new Map<string, EditableCell>();

  for (const disabledLabel of disabledLabels) {
    const disabledHex = paletteMap.get(disabledLabel) ?? null;
    const replacement = findReplacementColor(
      disabledLabel,
      disabledHex,
      activeUsedLabels,
      paletteMap,
    );
    if (replacement) {
      replacementMap.set(disabledLabel, replacement);
    }
  }

  return cells.map((cell) => {
    if (!cell.label) {
      return { ...cell };
    }
    const replacement = replacementMap.get(cell.label);
    return replacement ? { ...replacement } : { ...cell };
  });
}

function findReplacementColor(
  disabledLabel: string,
  disabledHex: string | null,
  activeUsedLabels: string[],
  paletteMap: Map<string, string>,
) {
  let best: EditableCell | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const label of activeUsedLabels) {
    if (label === disabledLabel) {
      continue;
    }

    const hex = paletteMap.get(label) ?? null;
    const distance = measureHexDistance255(disabledHex, hex);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { label, hex };
    }
  }

  return best;
}
