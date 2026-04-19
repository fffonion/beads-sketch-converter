import clsx from "clsx";
import { ImageUp, Languages, LaptopMinimal, Moon, Sun, X } from "lucide-react";
import {
  Suspense,
  lazy,
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { BrandLogo } from "./components/brand-logo";
import { BrandWordmark } from "./components/brand-wordmark";
import { LanguageSwitch, ThemeSwitch } from "./components/controls";
import { OriginalPreviewCard } from "./components/preview-cards";
import { SidebarPanel } from "./components/sidebar-panel";
import { MobileWorkspaceLoadingFallback, WorkspaceBusyIndicator } from "./components/workspace-busy-overlay";
import {
  applyDisabledColorReplacements,
  buildDisabledLabelsByCoverage,
  buildReplacementCell,
  cellsEqual,
  cloneEditableCells,
  combineNormalizedCropRects,
  cropEditableCells,
  floodFillCells,
  getActiveAspectRatio,
  getMatchedCoveragePercent,
  getRenderedEditableCells,
  hasLargeAspectRatioMismatch,
  isFullCanvasCropRect,
  loadImageMetadata,
  mergeDisplayMatchedColors,
  readFileAsDataUrl,
  replaceBrushArea,
  replaceLabelAcrossCells,
  resolveMatchedColorsBase,
  summarizeMatchedColors,
  waitForNextPaint,
  type CanvasCropRect,
  type EditTool,
  type GridAxis,
} from "./lib/editor-utils";
import { createChartShareQrDataUrl } from "./lib/chart-qr";
import { drawBrandWordmark, measureBrandWordmarkWidth } from "./lib/brand-wordmark";
import { defaultLocale, getMessages, type Locale } from "./lib/i18n";
import {
  pindouBoardThemes,
  type PindouBeadShape,
  type PindouBoardTheme,
} from "./lib/pindou-board-theme";
import {
  buildChartShareUrl,
  deserializeChartPayload,
  serializeChartPayload,
} from "./lib/chart-serialization";
import {
  exportChartFromCells,
  getPaletteOptions,
  measureHexDistance255,
  processImageFile,
  type ChartExportSettings,
  type EditableCell,
  type NormalizedCropRect,
  type ProcessResult,
} from "./lib/chart-processor";
import { getThemeClasses, type ThemeMode } from "./lib/theme";
import {
  getWorkspaceStageBusy,
  getWorkspaceUiBusy,
  scheduleWorkspaceStageBusyProcessing,
  shouldShowWorkspacePanelsSuspenseLoading,
} from "./lib/workspace-busy-state";
import {
  parseStoredPindouTimerState,
  serializePindouTimerState,
} from "./lib/pindou-timer-storage";
import {
  getMobileHeaderChromeLayout,
  getMobileHeaderChromeMetrics,
  getMobileLandingLayout,
  isMobileLikeEnvironment,
  shouldUseMobileWorkspaceShell,
} from "./lib/workspace-layout";
import type { EditorPanelMode } from "./components/pixel-editor-panel";

type GridMode = "auto" | "manual";

interface EditorSnapshot {
  cells: EditableCell[];
  gridWidth: number;
  gridHeight: number;
}

const localeStorageKey = "pindou-convert-locale";
const themeStorageKey = "pindou-convert-theme";
const pindouBeadShapeStorageKey = "pindou-convert-pindou-bead-shape";
const pindouBoardThemeStorageKey = "pindou-convert-pindou-board-theme";
const pindouTimerStorageKey = "pindou-convert-pindou-timer";
const EMPTY_SELECTION_LABEL = "__EMPTY__";
const APP_BRAND_TITLE = "拼豆豆";
const APP_BRAND_TITLE_MOBILE = "拼豆豆";
const CHART_SHARE_QR_SIZE = 1200;
const CHART_SHARE_QR_FALLBACK_URL = "yooooo.us/pdd/";
const CHART_SHARE_QR_CANVAS_FILL = "#FFF8ED";
const CHART_SHARE_QR_CARD_FILL = "#FFFFFF";
const GRAYSCALE_BASE_COLOR_SYSTEM_ID = "mard_221";
const DEFAULT_CONTRAST = 0;
const DEFAULT_GRAYSCALE_CONTRAST = 100;
const DEFAULT_RENDER_STYLE_BIAS = 75;
const DEFAULT_GRAYSCALE_RENDER_STYLE_BIAS = 0;
const DEFAULT_GRAYSCALE_DISABLED_LABELS = ["H1", "H6", "H22", "H10"] as const;
const DEFAULT_GRAYSCALE_DISABLED_HEXES = new Set(
  getPaletteOptions(GRAYSCALE_BASE_COLOR_SYSTEM_ID, true)
    .filter((entry) => DEFAULT_GRAYSCALE_DISABLED_LABELS.includes(entry.label as (typeof DEFAULT_GRAYSCALE_DISABLED_LABELS)[number]))
    .map((entry) => entry.hex),
);
const WorkspacePanels = lazy(async () => {
  const module = await import("./components/workspace-panels");
  return { default: module.WorkspacePanels };
});

function getDefaultDisabledResultLabels(
  grayscaleMode: boolean,
  paletteOptions: Array<{ label: string; hex: string }>,
) {
  if (!grayscaleMode) {
    return [];
  }

  return paletteOptions
    .filter((entry) => DEFAULT_GRAYSCALE_DISABLED_HEXES.has(entry.hex))
    .map((entry) => entry.label);
}

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

function readInitialPindouBeadShape(): PindouBeadShape {
  if (typeof window === "undefined") {
    return "square";
  }

  const stored = window.localStorage.getItem(pindouBeadShapeStorageKey);
  return stored === "circle" || stored === "square" ? stored : "square";
}

function readInitialPindouBoardTheme(): PindouBoardTheme {
  if (typeof window === "undefined") {
    return "gray";
  }

  const stored = window.localStorage.getItem(pindouBoardThemeStorageKey);
  return pindouBoardThemes.includes(stored as PindouBoardTheme)
    ? (stored as PindouBoardTheme)
    : "gray";
}

function readInitialPindouTimerState() {
  if (typeof window === "undefined") {
    return parseStoredPindouTimerState(null);
  }

  return parseStoredPindouTimerState(window.localStorage.getItem(pindouTimerStorageKey));
}

function isTypingElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenCapableDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};

function getFullscreenElement() {
  if (typeof document === "undefined") {
    return null;
  }

  const fullscreenDocument = document as FullscreenCapableDocument;
  return document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;
}

async function requestBrowserFullscreen() {
  if (typeof document === "undefined") {
    return;
  }

  const target = document.documentElement as FullscreenCapableElement;
  if (document.fullscreenElement || getFullscreenElement()) {
    return;
  }

  if (typeof target.requestFullscreen === "function") {
    await target.requestFullscreen();
    return;
  }

  if (typeof target.webkitRequestFullscreen === "function") {
    await target.webkitRequestFullscreen();
  }
}

async function exitBrowserFullscreen() {
  if (typeof document === "undefined") {
    return;
  }

  const fullscreenDocument = document as FullscreenCapableDocument;
  if (typeof document.exitFullscreen === "function") {
    await document.exitFullscreen();
    return;
  }

  if (typeof fullscreenDocument.webkitExitFullscreen === "function") {
    await fullscreenDocument.webkitExitFullscreen();
  }
}

function stripFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

function WorkspacePanelsSuspenseFallback({
  isDark,
  busy,
  readyHint,
  minHeightClassName = "min-h-[520px]",
  mobileApp = false,
}: {
  isDark: boolean;
  busy: boolean;
  readyHint: string;
  minHeightClassName?: string;
  mobileApp?: boolean;
}) {
  const theme = getThemeClasses(isDark);

  if (mobileApp && busy) {
    return <MobileWorkspaceLoadingFallback isDark={isDark} />;
  }

  return (
    <section
      className={clsx(
        "w-full rounded-[14px] border p-4 backdrop-blur transition-colors sm:rounded-[16px] sm:p-5 xl:rounded-[18px]",
        minHeightClassName,
        theme.panel,
      )}
    >
      <div
        className={clsx(
          "flex h-full min-h-[220px] items-center justify-center rounded-[10px] border border-dashed px-5 py-10 text-center text-sm transition-colors",
          theme.emptyState,
        )}
      >
        {busy ? (
          <WorkspaceBusyIndicator isDark={isDark} />
        ) : (
          readyHint
        )}
      </div>
    </section>
  );
}

function normalizeDownloadBaseName(input: string) {
  const normalized = input.trim().replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized || "pindou-chart";
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function loadCanvasImage(src: string) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

async function canvasToBlob(canvas: HTMLCanvasElement) {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to encode canvas."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

function roundRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const effectiveRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + effectiveRadius, y);
  context.arcTo(x + width, y, x + width, y + height, effectiveRadius);
  context.arcTo(x + width, y + height, x, y + height, effectiveRadius);
  context.arcTo(x, y + height, x, y, effectiveRadius);
  context.arcTo(x, y, x + width, y, effectiveRadius);
  context.closePath();
}

function drawBrandLogoOnCanvas(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  const stroke = "rgba(33,24,17,0.88)";
  const paperFill = "#F5E8D2";
  const gridStroke = "#CDB79A";
  const beadHole = "#F7F2E8";
  const lineWidth = Math.max(1.4, size * 0.08);

  const paperX = x + size * 0.06;
  const paperY = y + size * 0.06;
  const paperWidth = size * 0.66;
  const paperHeight = size * 0.82;
  const foldSize = size * 0.18;
  const radius = Math.max(4, size * 0.08);

  roundRectPath(context, paperX, paperY, paperWidth, paperHeight, radius);
  context.fillStyle = paperFill;
  context.fill();
  context.lineWidth = lineWidth;
  context.strokeStyle = stroke;
  context.stroke();

  context.beginPath();
  context.moveTo(paperX + paperWidth - foldSize, paperY);
  context.lineTo(paperX + paperWidth - foldSize, paperY + foldSize);
  context.lineTo(paperX + paperWidth, paperY + foldSize);
  context.strokeStyle = stroke;
  context.stroke();

  context.strokeStyle = gridStroke;
  context.lineWidth = Math.max(1, size * 0.045);
  const gridLeft = paperX + size * 0.12;
  const gridTop = paperY + size * 0.18;
  const gridWidth = paperWidth - size * 0.2;
  const gridHeight = paperHeight - size * 0.28;
  for (let index = 1; index <= 2; index += 1) {
    const verticalX = gridLeft + (gridWidth / 3) * index;
    const horizontalY = gridTop + (gridHeight / 3) * index;
    context.beginPath();
    context.moveTo(verticalX, gridTop);
    context.lineTo(verticalX, gridTop + gridHeight);
    context.stroke();
    context.beginPath();
    context.moveTo(gridLeft, horizontalY);
    context.lineTo(gridLeft + gridWidth, horizontalY);
    context.stroke();
  }

  const beadRadius = size * 0.18;
  const innerRadius = beadRadius * 0.42;
  const beads: Array<[number, number, string]> = [
    [x + size * 0.28, y + size * 0.72, "#D57D42"],
    [x + size * 0.53, y + size * 0.56, "#8DAE63"],
    [x + size * 0.77, y + size * 0.76, "#6E87C7"],
  ];

  for (const [centerX, centerY, fill] of beads) {
    context.beginPath();
    context.arc(centerX, centerY, beadRadius, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
    context.lineWidth = lineWidth;
    context.strokeStyle = stroke;
    context.stroke();

    context.beginPath();
    context.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
    context.fillStyle = beadHole;
    context.fill();
    context.strokeStyle = stroke;
    context.stroke();
  }
}

function resolveChartShareHeaderUrlFontSize(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  let fontSize = 18;
  while (fontSize > 11) {
    context.font = `600 ${fontSize}px "Aptos", "Segoe UI", sans-serif`;
    if (context.measureText(text).width <= maxWidth) {
      return fontSize;
    }
    fontSize -= 1;
  }
  return 11;
}

async function drawChartShareQrFallbackHeader(
  context: CanvasRenderingContext2D,
  canvasSize: number,
) {
  const headerInset = Math.round(canvasSize * 0.08);
  const headerX = headerInset;
  const headerY = Math.round(canvasSize * 0.06);
  const headerWidth = canvasSize - headerInset * 2;
  const headerHeight = Math.round(canvasSize * 0.125);

  const logoSize = Math.round(headerHeight * 0.38);
  const brandGap = Math.round(headerHeight * 0.12);
  const wordmarkHeight = Math.round(headerHeight * 0.42);
  const wordmarkWidth = measureBrandWordmarkWidth(wordmarkHeight);
  const brandWidth = logoSize + brandGap + wordmarkWidth;
  const brandCenterY = headerY + Math.round(headerHeight * 0.32);
  const brandGroupX = headerX + (headerWidth - brandWidth) / 2;
  const logoY = brandCenterY - logoSize / 2;
  const urlMaxWidth = headerWidth - Math.round(headerHeight * 0.8);
  const urlFontSize = resolveChartShareHeaderUrlFontSize(
    context,
    CHART_SHARE_QR_FALLBACK_URL,
    urlMaxWidth,
  );
  context.font = `600 ${urlFontSize}px "Aptos", "Segoe UI", sans-serif`;
  const urlWidth = context.measureText(CHART_SHARE_QR_FALLBACK_URL).width;

  drawBrandLogoOnCanvas(context, brandGroupX, logoY, logoSize);
  await drawBrandWordmark(
    context,
    brandGroupX + logoSize + brandGap,
    brandCenterY,
    wordmarkHeight,
  );

  context.save();
  context.fillStyle = "rgba(61, 43, 27, 0.78)";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `600 ${urlFontSize}px "Aptos", "Segoe UI", sans-serif`;
  context.fillText(
    CHART_SHARE_QR_FALLBACK_URL,
    headerX + headerWidth / 2,
    headerY + Math.round(headerHeight * 0.82),
    urlWidth,
  );
  context.restore();

  return {
    bottom: headerY + headerHeight,
  };
}

async function buildChartShareQrBlob(
  shareUrl: string,
  chartQrTooLargeMessage: string,
) {
  const canvas = document.createElement("canvas");
  canvas.width = CHART_SHARE_QR_SIZE;
  canvas.height = CHART_SHARE_QR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context is unavailable.");
  }

  const qrPadding = 84;
  const renderedQrSize = CHART_SHARE_QR_SIZE - qrPadding * 2;
  let qrDataUrl: string;
  let renderStyle: "badge-overlay" | "plain";
  try {
    const generated = await createChartShareQrDataUrl(shareUrl, renderedQrSize);
    qrDataUrl = generated.src;
    renderStyle = generated.renderStyle;
  } catch {
    throw new Error(chartQrTooLargeMessage);
  }
  const qrImage = await loadCanvasImage(qrDataUrl);

  context.fillStyle = CHART_SHARE_QR_CANVAS_FILL;
  context.fillRect(0, 0, CHART_SHARE_QR_SIZE, CHART_SHARE_QR_SIZE);
  let qrDrawX = qrPadding;
  let qrDrawY = qrPadding;
  let qrDrawSize = renderedQrSize;
  if (renderStyle === "plain") {
    const fallbackHeader = await drawChartShareQrFallbackHeader(context, CHART_SHARE_QR_SIZE);
    const headerGap = Math.round(CHART_SHARE_QR_SIZE * 0.03);
    qrDrawSize = Math.min(
      renderedQrSize,
      CHART_SHARE_QR_SIZE - qrPadding * 2,
      CHART_SHARE_QR_SIZE - fallbackHeader.bottom - headerGap - qrPadding,
    );
    qrDrawX = Math.round((CHART_SHARE_QR_SIZE - qrDrawSize) / 2);
    qrDrawY = Math.round(fallbackHeader.bottom + headerGap);
  }

  const qrCardPadding = Math.round(CHART_SHARE_QR_SIZE * 0.028);
  const qrCardX = qrDrawX - qrCardPadding;
  const qrCardY = qrDrawY - qrCardPadding;
  const qrCardSize = qrDrawSize + qrCardPadding * 2;
  const qrCardRadius = Math.round(qrCardPadding * 1.3);

  context.save();
  context.shadowColor = "rgba(71, 48, 24, 0.12)";
  context.shadowBlur = 20;
  context.shadowOffsetY = 8;
  roundRectPath(context, qrCardX, qrCardY, qrCardSize, qrCardSize, qrCardRadius);
  context.fillStyle = CHART_SHARE_QR_CARD_FILL;
  context.fill();
  context.restore();

  roundRectPath(context, qrCardX, qrCardY, qrCardSize, qrCardSize, qrCardRadius);
  context.lineWidth = 2;
  context.strokeStyle = "rgba(99, 69, 41, 0.12)";
  context.stroke();

  context.imageSmoothingEnabled = false;
  context.drawImage(qrImage, qrDrawX, qrDrawY, qrDrawSize, qrDrawSize);
  context.imageSmoothingEnabled = true;

  if (renderStyle === "badge-overlay") {
    const badgeWidth = Math.round(CHART_SHARE_QR_SIZE * 0.34);
    const badgeHeight = Math.round(CHART_SHARE_QR_SIZE * 0.135);
    const badgeX = Math.round((CHART_SHARE_QR_SIZE - badgeWidth) / 2);
    const badgeY = Math.round((CHART_SHARE_QR_SIZE - badgeHeight) / 2);
    const badgeRadius = 30;

    context.save();
    context.shadowColor = "rgba(71, 48, 24, 0.18)";
    context.shadowBlur = 22;
    context.shadowOffsetY = 8;
    roundRectPath(context, badgeX, badgeY, badgeWidth, badgeHeight, badgeRadius);
    context.fillStyle = "#FFF8ED";
    context.fill();
    context.restore();

    roundRectPath(context, badgeX, badgeY, badgeWidth, badgeHeight, badgeRadius);
    context.lineWidth = 2;
    context.strokeStyle = "rgba(99, 69, 41, 0.14)";
    context.stroke();

    const logoSize = Math.round(badgeHeight * 0.64);
    const contentGap = Math.round(badgeHeight * 0.18);
    const wordmarkHeight = Math.round(badgeHeight * 0.74);
    const wordmarkWidth = measureBrandWordmarkWidth(wordmarkHeight);
    const groupWidth = logoSize + contentGap + wordmarkWidth;
    const groupX = badgeX + (badgeWidth - groupWidth) / 2;
    const logoY = badgeY + (badgeHeight - logoSize) / 2;
    drawBrandLogoOnCanvas(context, groupX, logoY, logoSize);
    await drawBrandWordmark(
      context,
      groupX + logoSize + contentGap,
      badgeY + badgeHeight / 2,
      wordmarkHeight,
    );
  }

  return await canvasToBlob(canvas);
}

function extractSharedChartCode(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("pd")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const fromUrl = url.searchParams.get("c");
    if (fromUrl) {
      return fromUrl;
    }
  } catch {
    // Ignore invalid URLs and fall back to raw parsing.
  }

  const normalized = trimmed.startsWith("c=") ? `?${trimmed}` : trimmed;
  const match = normalized.match(/(?:^|[?&])c=([^&#\s]+)/);
  if (match?.[1]) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }

  return trimmed;
}

function canDecodeSharedChartCode(input: string) {
  const serialized = extractSharedChartCode(input);
  if (!serialized) {
    return false;
  }

  try {
    deserializeChartPayload(serialized);
    return true;
  } catch {
    return false;
  }
}

async function copyPlainText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("Clipboard is unavailable.");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

export default function App() {
  const runIdRef = useRef(0);
  const paintActiveRef = useRef(false);
  const sourceMetaRunIdRef = useRef(0);
  const chartPreviewRunIdRef = useRef(0);
  const editorHistoryRef = useRef<EditorSnapshot[]>([]);
  const editorHistoryIndexRef = useRef(-1);
  const editorDraftRef = useRef<EditableCell[] | null>(null);
  const inputUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const sharedChartLoadAttemptedRef = useRef(false);
  const disabledResultLabelsRef = useRef<string[]>([]);
  const sourceFocusOverlayRef = useRef<HTMLDivElement | null>(null);
  const landingDragDepthRef = useRef(0);
  const landingChartImportRunIdRef = useRef(0);
  const lastNonCropEditToolRef = useRef<EditTool>("pan");
  const saveChartRef = useRef<(() => void) | null>(null);
  const chartPreviewUrlRef = useRef<string | null>(null);
  const chartShareLinkCopiedTimeoutRef = useRef<number | null>(null);
  const chartShareCodeCopiedTimeoutRef = useRef<number | null>(null);

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
  const [landingDragActive, setLandingDragActive] = useState(false);
  const [landingChartCode, setLandingChartCode] = useState("");
  const [landingChartImportBusy, setLandingChartImportBusy] = useState(false);
  const [landingChartCodeInvalid, setLandingChartCodeInvalid] = useState(false);

  const [gridMode, setGridMode] = useState<GridMode>("auto");
  const [colorSystemId, setColorSystemId] = useState("mard_221");
  const [grayscaleMode, setGrayscaleMode] = useState(false);
  const [gridWidth, setGridWidth] = useState("33");
  const [gridHeight, setGridHeight] = useState("33");
  const [manualLastEditedAxis, setManualLastEditedAxis] = useState<GridAxis>("width");
  const [followSourceRatio, setFollowSourceRatio] = useState(true);
  const [reduceColors, setReduceColors] = useState(true);
  const [reduceColorsTouched, setReduceColorsTouched] = useState(false);
  const [contrast, setContrast] = useState(DEFAULT_CONTRAST);
  const [renderStyleBias, setRenderStyleBias] = useState(DEFAULT_RENDER_STYLE_BIAS);
  const [reduceTolerance, setReduceTolerance] = useState(16);
  const [preSharpen, setPreSharpen] = useState(true);
  const [preSharpenStrength, setPreSharpenStrength] = useState(20);
  const [fftEdgeEnhanceStrength, setFftEdgeEnhanceStrength] = useState(0);
  const [fftEdgeEnhanceOverrideLabel, setFftEdgeEnhanceOverrideLabel] = useState<string | null>(null);
  const [editTool, setEditTool] = useState<EditTool>("pan");
  const [canvasCropSelection, setCanvasCropSelection] = useState<CanvasCropRect | null>(null);
  const [editZoom, setEditZoom] = useState(1);
  const [editFlipHorizontal, setEditFlipHorizontal] = useState(false);
  const [brushSize, setBrushSize] = useState(1);
  const [fillTolerance, setFillTolerance] = useState(16);
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [disabledResultLabels, setDisabledResultLabels] = useState<string[]>([]);
  const [editorHistory, setEditorHistory] = useState<EditorSnapshot[]>([]);
  const [editorHistoryIndex, setEditorHistoryIndex] = useState(-1);
  const [editorDraftCells, setEditorDraftCells] = useState<EditableCell[] | null>(null);
  const [sourceFocusViewOpen, setSourceFocusViewOpen] = useState(false);
  const [pindouFocusViewOpen, setPindouFocusViewOpen] = useState(false);
  const [editorPanelMode, setEditorPanelMode] = useState<EditorPanelMode>("edit");
  const [pindouFlipHorizontal, setPindouFlipHorizontal] = useState(false);
  const [pindouShowLabels, setPindouShowLabels] = useState(false);
  const [pindouBeadShape, setPindouBeadShape] = useState<PindouBeadShape>(
    readInitialPindouBeadShape,
  );
  const [pindouBoardTheme, setPindouBoardTheme] = useState<PindouBoardTheme>(
    readInitialPindouBoardTheme,
  );
  const initialPindouTimerState = useMemo(readInitialPindouTimerState, []);
  const [pindouZoom, setPindouZoom] = useState(1);
  const [pindouTimerRunning, setPindouTimerRunning] = useState(initialPindouTimerState.running);
  const [pindouTimerElapsedMs, setPindouTimerElapsedMs] = useState(initialPindouTimerState.elapsedMs);
  const pindouTimerStartedAtRef = useRef<number | null>(initialPindouTimerState.startedAt);
  const [chartExportTitle, setChartExportTitle] = useState("");
  const [chartWatermarkText, setChartWatermarkText] = useState("");
  const [chartWatermarkImageDataUrl, setChartWatermarkImageDataUrl] = useState<string | null>(null);
  const [chartWatermarkImageName, setChartWatermarkImageName] = useState("");
  const [chartSaveMetadata, setChartSaveMetadata] = useState(true);
  const [chartLockEditing, setChartLockEditing] = useState(false);
  const [chartIncludeGuides, setChartIncludeGuides] = useState(true);
  const [chartShowColorLabels, setChartShowColorLabels] = useState(true);
  const [chartGaplessCells, setChartGaplessCells] = useState(false);
  const [chartIncludeBoardPattern, setChartIncludeBoardPattern] = useState(false);
  const [chartBoardTheme, setChartBoardTheme] = useState<PindouBoardTheme>("gray");
  const [chartIncludeLegend, setChartIncludeLegend] = useState(true);
  const [chartIncludeQrCode, setChartIncludeQrCode] = useState(false);
  const [savingChart, setSavingChart] = useState(false);
  const [chartPreviewUrl, setChartPreviewUrl] = useState<string | null>(null);
  const [chartPreviewError, setChartPreviewError] = useState<string | null>(null);
  const [chartPreviewBusy, setChartPreviewBusy] = useState(false);
  const [editorRefreshBusy, setEditorRefreshBusy] = useState(false);
  const [chartShareLinkCopied, setChartShareLinkCopied] = useState(false);
  const [chartShareCodeCopied, setChartShareCodeCopied] = useState(false);
  const [chartShareQrBusy, setChartShareQrBusy] = useState(false);
  const lastNonGrayscaleColorSystemIdRef = useRef("mard_221");
  const lastNonGrayscaleContrastRef = useRef(DEFAULT_CONTRAST);
  const lastGrayscaleContrastRef = useRef(DEFAULT_GRAYSCALE_CONTRAST);
  const lastNonGrayscaleRenderStyleBiasRef = useRef(DEFAULT_RENDER_STYLE_BIAS);
  const lastGrayscaleRenderStyleBiasRef = useRef(DEFAULT_GRAYSCALE_RENDER_STYLE_BIAS);

  const effectiveColorSystemId = colorSystemId;
  const paletteOptions = getPaletteOptions(effectiveColorSystemId, grayscaleMode);
  const [selectedLabel, setSelectedLabel] = useState<string>(paletteOptions[0]?.label ?? "A1");

  const t = getMessages(locale);
  const isDark = themeMode === "dark" || (themeMode === "system" && systemPrefersDark);
  const mobileEnvironment =
    typeof navigator === "undefined"
      ? false
      : isMobileLikeEnvironment({
        userAgent: navigator.userAgent ?? "",
        maxTouchPoints: typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0,
      });
  const useBrowserFullscreenForPindou = mobileEnvironment;
  const theme = getThemeClasses(isDark);
  const chartCodeInputClassName = clsx(
    "min-h-[120px] w-full rounded-md border px-3 py-2 text-sm leading-6 shadow-inner outline-none transition",
    isDark
      ? "border-white/10 bg-[#110d0b] text-stone-200 focus:border-white/18"
      : "border-stone-300 bg-[#f6efe2] text-stone-800 focus:border-stone-500",
  );
  const activeAspectRatio = getActiveAspectRatio(sourceSize, cropMode ? cropRect : null);
  const topError = error;
  const chartEditingLocked = result?.editingLocked ?? false;
  const effectiveChartSaveMetadata = chartSaveMetadata || chartLockEditing;
  const previewCropRect = combineNormalizedCropRects(
    cropMode ? cropRect : null,
    result?.detectedCropRect ?? null,
  );
  const sourceBadge =
    result?.preferredEditorMode === "pindou"
      ? { kind: "chart" as const, label: t.sourceChartBadge }
      : result && result.detectionMode !== "converted-from-image"
        ? { kind: "pixel-art" as const, label: t.sourcePixelArtBadge }
        : file
          ? { kind: "image" as const, label: t.sourceImageBadge }
          : null;

  const currentEditorSnapshot = useMemo<EditorSnapshot | null>(() => {
    if (editorHistoryIndex >= 0) {
      return editorHistory[editorHistoryIndex] ?? null;
    }
    if (!result) {
      return null;
    }
    return {
      cells: result.cells,
      gridWidth: result.gridWidth,
      gridHeight: result.gridHeight,
    };
  }, [editorHistory, editorHistoryIndex, result]);
  const editorBaseCells = useMemo(
    () => editorDraftCells ?? currentEditorSnapshot?.cells ?? [],
    [currentEditorSnapshot, editorDraftCells],
  );
  const editorGridWidth = currentEditorSnapshot?.gridWidth ?? result?.gridWidth ?? 0;
  const editorGridHeight = currentEditorSnapshot?.gridHeight ?? result?.gridHeight ?? 0;
  const workspaceBusy = getWorkspaceUiBusy(busy, editorRefreshBusy);
  const workspaceStageBusy = getWorkspaceStageBusy(busy, editorRefreshBusy);
  const useMobileWorkspace = shouldUseMobileWorkspaceShell({
    userAgent: typeof navigator === "undefined" ? "" : (navigator.userAgent ?? ""),
    maxTouchPoints:
      typeof navigator !== "undefined" && typeof navigator.maxTouchPoints === "number"
        ? navigator.maxTouchPoints
        : 0,
  });
  const [isLandscapeViewport, setIsLandscapeViewport] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.innerWidth > window.innerHeight;
  });
  const mobileHeaderChrome = getMobileHeaderChromeMetrics();
  const mobileHeaderLayout = getMobileHeaderChromeLayout();
  const mobileHeaderOffset = `calc(env(safe-area-inset-top) + ${mobileHeaderChrome.minHeightPx}px + ${mobileHeaderChrome.topInsetRem + mobileHeaderChrome.verticalPaddingRem}rem)`;
  const mobileLandingLayout = getMobileLandingLayout({
    useMobileWorkspace,
    isLandscapeViewport,
  });

  useEffect(() => {
    function syncLandscapeViewport() {
      setIsLandscapeViewport(window.innerWidth > window.innerHeight);
    }

    syncLandscapeViewport();
    window.addEventListener("resize", syncLandscapeViewport);
    window.addEventListener("orientationchange", syncLandscapeViewport);
    return () => {
      window.removeEventListener("resize", syncLandscapeViewport);
      window.removeEventListener("orientationchange", syncLandscapeViewport);
    };
  }, []);
  const renderedEditorCells = useMemo(
    () =>
      getRenderedEditableCells(
        editorBaseCells,
        disabledResultLabels,
        paletteOptions,
      ),
    [editorBaseCells, disabledResultLabels, paletteOptions],
  );
  const preferProcessedMatchedColors = editorDraftCells === null && editorHistoryIndex <= 0;
  const baseMatchedColors = useMemo(
    () =>
      resolveMatchedColorsBase(
        result?.colors,
        editorBaseCells,
        paletteOptions,
        preferProcessedMatchedColors,
      ),
    [editorBaseCells, paletteOptions, preferProcessedMatchedColors, result?.colors],
  );
  const renderedMatchedColors = useMemo(
    () => summarizeMatchedColors(renderedEditorCells, paletteOptions),
    [renderedEditorCells, paletteOptions],
  );
  const displayMatchedColors = useMemo(
    () => mergeDisplayMatchedColors(baseMatchedColors, renderedMatchedColors),
    [baseMatchedColors, renderedMatchedColors],
  );
  const matchedCoveragePercent = useMemo(
    () => getMatchedCoveragePercent(baseMatchedColors, disabledResultLabels),
    [baseMatchedColors, disabledResultLabels],
  );
  const chartShareCode = useMemo(() => {
    if (!result || editorGridWidth <= 0 || editorGridHeight <= 0) {
      return "";
    }

    try {
      return serializeChartPayload(
        {
          colorSystemId: effectiveColorSystemId,
          gridWidth: editorGridWidth,
          gridHeight: editorGridHeight,
          editingLocked: chartLockEditing,
          title: chartExportTitle.trim(),
          cells: renderedEditorCells.map((cell) =>
            cell?.label
              ? [cell.label, cell.source === "manual" ? 1 : 0] as [string, 1 | 0]
              : null,
          ),
        },
        {
          includeManualRuns: false,
          includePreferredEditorMode: false,
        },
      );
    } catch {
      return "";
    }
  }, [
    chartExportTitle,
    chartLockEditing,
    editorGridHeight,
    editorGridWidth,
    effectiveColorSystemId,
    renderedEditorCells,
    result,
  ]);
  const chartShareUrl = useMemo(
    () => (chartShareCode ? buildChartShareUrl(chartShareCode) : ""),
    [chartShareCode],
  );

  useEffect(() => {
    setChartShareCodeCopied(false);
    if (chartShareCodeCopiedTimeoutRef.current !== null) {
      window.clearTimeout(chartShareCodeCopiedTimeoutRef.current);
      chartShareCodeCopiedTimeoutRef.current = null;
    }
  }, [chartShareCode]);

  useEffect(() => {
    setChartShareLinkCopied(false);
    if (chartShareLinkCopiedTimeoutRef.current !== null) {
      window.clearTimeout(chartShareLinkCopiedTimeoutRef.current);
      chartShareLinkCopiedTimeoutRef.current = null;
    }
  }, [chartShareUrl]);

  useEffect(() => {
    return () => {
      if (chartShareLinkCopiedTimeoutRef.current !== null) {
        window.clearTimeout(chartShareLinkCopiedTimeoutRef.current);
        chartShareLinkCopiedTimeoutRef.current = null;
      }
      if (chartShareCodeCopiedTimeoutRef.current !== null) {
        window.clearTimeout(chartShareCodeCopiedTimeoutRef.current);
        chartShareCodeCopiedTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    disabledResultLabelsRef.current = disabledResultLabels;
  }, [disabledResultLabels]);

  useEffect(() => {
    if (!sourceFocusViewOpen || typeof window === "undefined") {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSourceFocusViewOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sourceFocusViewOpen]);

  useEffect(() => {
    if (!sourceFocusViewOpen) {
      return;
    }

    sourceFocusOverlayRef.current?.focus();
  }, [sourceFocusViewOpen]);

  async function handlePindouFocusViewOpenChange(nextOpen: boolean) {
    if (!useBrowserFullscreenForPindou) {
      setPindouFocusViewOpen(nextOpen);
      return;
    }

    if (nextOpen) {
      try {
        await requestBrowserFullscreen();
      } catch {
        // Ignore browser fullscreen failures and still enter the in-app focus view.
      }

      setPindouFocusViewOpen(true);
      return;
    }

    setPindouFocusViewOpen(false);

    try {
      if (getFullscreenElement()) {
        await exitBrowserFullscreen();
      }
    } catch {
      // Ignore exit failures so the in-app focus view can still close normally.
    }
  }

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

  function handleManualCropChange(nextCropRect: NormalizedCropRect | null) {
    setCropRect(nextCropRect);
  }

  function applyColorSystemId(nextColorSystemId: string) {
    setColorSystemId(nextColorSystemId);
    lastNonGrayscaleColorSystemIdRef.current = nextColorSystemId;
  }

  function handleGrayscaleModeChange(nextGrayscaleMode: boolean) {
    if (nextGrayscaleMode === grayscaleMode) {
      return;
    }

    if (nextGrayscaleMode) {
      lastNonGrayscaleContrastRef.current = contrast;
      lastNonGrayscaleRenderStyleBiasRef.current = renderStyleBias;
      setContrast(lastGrayscaleContrastRef.current);
      setRenderStyleBias(lastGrayscaleRenderStyleBiasRef.current);
    } else {
      lastGrayscaleContrastRef.current = contrast;
      lastGrayscaleRenderStyleBiasRef.current = renderStyleBias;
      setContrast(lastNonGrayscaleContrastRef.current);
      setRenderStyleBias(lastNonGrayscaleRenderStyleBiasRef.current);
    }

    setGrayscaleMode(nextGrayscaleMode);
    const nextDisabledResultLabels = getDefaultDisabledResultLabels(
      nextGrayscaleMode,
      getPaletteOptions(colorSystemId, nextGrayscaleMode),
    );
    disabledResultLabelsRef.current = nextDisabledResultLabels;
    setDisabledResultLabels(nextDisabledResultLabels);
  }

  function handleContrastChange(nextContrast: number) {
    setContrast(nextContrast);
    if (grayscaleMode) {
      lastGrayscaleContrastRef.current = nextContrast;
      return;
    }
    lastNonGrayscaleContrastRef.current = nextContrast;
  }

  function handleRenderStyleBiasChange(nextRenderStyleBias: number) {
    setRenderStyleBias(nextRenderStyleBias);
    if (grayscaleMode) {
      lastGrayscaleRenderStyleBiasRef.current = nextRenderStyleBias;
      return;
    }
    lastNonGrayscaleRenderStyleBiasRef.current = nextRenderStyleBias;
  }

  function handleReduceColorsChange(nextReduceColors: boolean) {
    setReduceColorsTouched(true);
    setReduceColors(nextReduceColors);
  }

  function handleEditToolChange(nextTool: EditTool) {
    paintActiveRef.current = false;
    if (nextTool === "crop") {
      setCanvasCropSelection(null);
    } else {
      lastNonCropEditToolRef.current = nextTool;
      if (editTool === "crop") {
        setCanvasCropSelection(null);
      }
    }
    setEditTool(nextTool);
  }

  function exitCanvasCropMode() {
    setCanvasCropSelection(null);
    setEditTool(lastNonCropEditToolRef.current === "crop" ? "pan" : lastNonCropEditToolRef.current);
  }

  function handleCanvasCropCancel() {
    exitCanvasCropMode();
  }

  function handleGridModeChange(nextGridMode: GridMode) {
    if (nextGridMode === gridMode) {
      return;
    }

    setGridMode(nextGridMode);
    if (
      nextGridMode === "manual" &&
      gridMode === "auto" &&
      result
    ) {
      setGridWidth(String(result.gridWidth));
      setGridHeight(String(result.gridHeight));
      if (previewCropRect) {
        setCropRect(previewCropRect);
        setCropMode(true);
      }
    }
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

  function applyDetectedManualFallback(processed: ProcessResult) {
    setGridMode("manual");
    setGridWidth(String(processed.gridWidth));
    setGridHeight(String(processed.gridHeight));
    if (processed.detectedCropRect) {
      setCropRect(processed.detectedCropRect);
      setCropMode(true);
    }
  }

  function applyPlainManualFallback() {
    setGridMode("manual");
    setCropRect(null);
    setCropMode(false);
    applyManualFallbackGrid();
  }

  function handleFileSelection(nextFile: File | null) {
    landingDragDepthRef.current = 0;
    setLandingDragActive(false);
    sourceMetaRunIdRef.current += 1;
    setError(null);
    setBusy(Boolean(nextFile));
    setGridMode("auto");
    setGridWidth("33");
    setGridHeight("33");
    setManualLastEditedAxis("width");
    setFollowSourceRatio(true);
    setGrayscaleMode(false);
    setContrast(DEFAULT_CONTRAST);
    lastNonGrayscaleContrastRef.current = DEFAULT_CONTRAST;
    lastGrayscaleContrastRef.current = DEFAULT_GRAYSCALE_CONTRAST;
    setRenderStyleBias(DEFAULT_RENDER_STYLE_BIAS);
    lastNonGrayscaleRenderStyleBiasRef.current = DEFAULT_RENDER_STYLE_BIAS;
    lastGrayscaleRenderStyleBiasRef.current = DEFAULT_GRAYSCALE_RENDER_STYLE_BIAS;
    setReduceColors(true);
    setReduceColorsTouched(false);
    setFftEdgeEnhanceStrength(0);
    setFftEdgeEnhanceOverrideLabel(null);
    setCropRect(null);
    setCropMode(false);
    setSourceSize(null);
    setSourceComplexity(52);
    setSourceFocusViewOpen(false);
    setPindouFocusViewOpen(false);
    setEditorPanelMode("edit");
    setEditFlipHorizontal(false);
    setPindouFlipHorizontal(false);
    setPindouShowLabels(false);
    setPindouZoom(1);
    setPindouTimerRunning(false);
    setPindouTimerElapsedMs(0);
    pindouTimerStartedAtRef.current = null;
    handleEditToolChange("pan");
    setEditZoom(1);
    setDisabledResultLabels([]);
    disabledResultLabelsRef.current = [];
    editorHistoryRef.current = [];
    editorHistoryIndexRef.current = -1;
    editorDraftRef.current = null;
    setEditorHistory([]);
    setEditorHistoryIndex(-1);
    setEditorDraftCells(null);
    setChartLockEditing(false);

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

  function dragEventContainsFiles(event: ReactDragEvent<HTMLElement>) {
    return [...event.dataTransfer.items].some((item) => item.kind === "file");
  }

  function handleLandingDragEnter(event: ReactDragEvent<HTMLElement>) {
    if (!dragEventContainsFiles(event)) {
      return;
    }
    event.preventDefault();
    landingDragDepthRef.current += 1;
    setLandingDragActive(true);
  }

  function handleLandingDragOver(event: ReactDragEvent<HTMLElement>) {
    if (!dragEventContainsFiles(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!landingDragActive) {
      setLandingDragActive(true);
    }
  }

  function handleLandingDragLeave(event: ReactDragEvent<HTMLElement>) {
    if (!dragEventContainsFiles(event)) {
      return;
    }
    event.preventDefault();
    landingDragDepthRef.current = Math.max(0, landingDragDepthRef.current - 1);
    if (landingDragDepthRef.current === 0) {
      setLandingDragActive(false);
    }
  }

  function handleLandingDrop(event: ReactDragEvent<HTMLElement>) {
    if (!dragEventContainsFiles(event)) {
      return;
    }
    event.preventDefault();
    landingDragDepthRef.current = 0;
    setLandingDragActive(false);

    const droppedFile =
      [...event.dataTransfer.files].find((entry) => entry.type.startsWith("image/")) ??
      event.dataTransfer.files[0] ??
      null;
    handleFileSelection(droppedFile);
  }

  async function refreshEditedChart(
    nextCells: EditableCell[],
    disabledLabelsOverride?: string[],
    nextGrid?: { gridWidth: number; gridHeight: number },
  ) {
    if (!result || result.editingLocked) {
      return false;
    }

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setEditorRefreshBusy(true);
    setError(null);

    try {
      const targetGridWidth = nextGrid?.gridWidth ?? result.gridWidth;
      const targetGridHeight = nextGrid?.gridHeight ?? result.gridHeight;
      const renderedCells = applyDisabledColorReplacements(
        nextCells,
        disabledLabelsOverride ?? disabledResultLabels,
        paletteOptions,
      );
      const exported = await exportChartFromCells({
        cells: renderedCells,
        gridWidth: targetGridWidth,
        gridHeight: targetGridHeight,
        fileName: result.fileName,
        colorSystemId: effectiveColorSystemId,
        chartSettings: {
          saveMetadata: false,
        },
        messages: {
          canvasContextUnavailable: t.errorCanvasContextUnavailable,
          encodingFailed: t.errorEncodingFailed,
          chartSerializationTooManyColors: t.errorChartSerializationTooManyColors,
          chartQrTooLarge: t.errorChartQrTooLarge,
          chartQrCaption: t.chartQrCaption,
          chartTitle: t.chartTitle,
          chartMetaLine: t.chartMetaLine,
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
          gridWidth: targetGridWidth,
          gridHeight: targetGridHeight,
          cells: renderedCells,
          url,
        };
      });
      return true;
    } catch (processingError) {
      if (runIdRef.current !== runId) {
        return false;
      }
      setError(
        processingError instanceof Error ? processingError.message : t.processingFailed,
      );
      return false;
    } finally {
      if (runIdRef.current === runId) {
        setEditorRefreshBusy(false);
      }
    }
  }

  async function handleCanvasCropConfirm() {
    if (
      !result ||
      result.editingLocked ||
      !canvasCropSelection ||
      editorGridWidth <= 0 ||
      editorGridHeight <= 0
    ) {
      exitCanvasCropMode();
      return;
    }
    if (isFullCanvasCropRect(canvasCropSelection, editorGridWidth, editorGridHeight)) {
      exitCanvasCropMode();
      return;
    }

    const cropped = cropEditableCells(
      editorBaseCells,
      editorGridWidth,
      editorGridHeight,
      canvasCropSelection,
    );
    const applied = await refreshEditedChart(
      cropped.cells,
      disabledResultLabelsRef.current,
      {
        gridWidth: cropped.gridWidth,
        gridHeight: cropped.gridHeight,
      },
    );
    if (!applied) {
      return;
    }

    commitEditorSnapshot(
      cropped.cells,
      disabledResultLabelsRef.current,
      {
        gridWidth: cropped.gridWidth,
        gridHeight: cropped.gridHeight,
      },
      {
        skipRefresh: true,
      },
    );
    exitCanvasCropMode();
  }

  function createEditorSnapshot(
    cells: EditableCell[],
    nextGrid: { gridWidth: number; gridHeight: number },
  ): EditorSnapshot {
    return {
      cells: cloneEditableCells(cells),
      gridWidth: nextGrid.gridWidth,
      gridHeight: nextGrid.gridHeight,
    };
  }

  function resetEditorHistory(
    cells: EditableCell[],
    nextGrid: { gridWidth: number; gridHeight: number },
  ) {
    editorDraftRef.current = null;
    setEditorDraftCells(null);
    const snapshot = createEditorSnapshot(cells, nextGrid);
    editorHistoryRef.current = [snapshot];
    editorHistoryIndexRef.current = 0;
    setEditorHistory([snapshot]);
    setEditorHistoryIndex(0);
  }

  function commitEditorSnapshot(
    nextCells: EditableCell[],
    disabledLabelsOverride?: string[],
    nextGrid?: { gridWidth: number; gridHeight: number },
    options?: { skipRefresh?: boolean },
  ) {
    editorDraftRef.current = null;
    setEditorDraftCells(null);
    const snapshot = createEditorSnapshot(
      nextCells,
      nextGrid ?? {
        gridWidth: editorGridWidth,
        gridHeight: editorGridHeight,
      },
    );
    const base = editorHistoryRef.current.slice(0, editorHistoryIndexRef.current + 1);
    base.push(snapshot);
    editorHistoryRef.current = base;
    editorHistoryIndexRef.current = base.length - 1;
    setEditorHistory(base);
    setEditorHistoryIndex(base.length - 1);
    if (disabledLabelsOverride) {
      disabledResultLabelsRef.current = disabledLabelsOverride;
      setDisabledResultLabels(disabledLabelsOverride);
    }
    if (!options?.skipRefresh) {
      void refreshEditedChart(
        snapshot.cells,
        disabledLabelsOverride,
        {
          gridWidth: snapshot.gridWidth,
          gridHeight: snapshot.gridHeight,
        },
      );
    }
  }

  function stageEditorDraft(nextCells: EditableCell[]) {
    const snapshot = cloneEditableCells(nextCells);
    editorDraftRef.current = snapshot;
    setEditorDraftCells(snapshot);
  }

  function finalizeBrushStroke() {
    const draft = editorDraftRef.current;
    if (!draft) {
      return;
    }
    commitEditorSnapshot(draft, disabledResultLabelsRef.current);
  }

  const handleGlobalBrushPointerRelease = useEffectEvent(() => {
    const shouldFinalize = paintActiveRef.current;
    paintActiveRef.current = false;
    if (shouldFinalize) {
      finalizeBrushStroke();
    }
  });

  function handleUndo() {
    if (result?.editingLocked) {
      return;
    }
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
    void refreshEditedChart(
      cloneEditableCells(snapshot.cells),
      undefined,
      {
        gridWidth: snapshot.gridWidth,
        gridHeight: snapshot.gridHeight,
      },
    );
  }

  function handleRedo() {
    if (result?.editingLocked) {
      return;
    }
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
    void refreshEditedChart(
      cloneEditableCells(snapshot.cells),
      undefined,
      {
        gridWidth: snapshot.gridWidth,
        gridHeight: snapshot.gridHeight,
      },
    );
  }

  function applyDisabledResultLabels(nextDisabledLabels: string[]) {
    if (result?.editingLocked) {
      return;
    }
    disabledResultLabelsRef.current = nextDisabledLabels;
    setDisabledResultLabels(nextDisabledLabels);

    if (editorBaseCells.length > 0) {
      void refreshEditedChart(
        cloneEditableCells(editorBaseCells),
        nextDisabledLabels,
        {
          gridWidth: editorGridWidth,
          gridHeight: editorGridHeight,
        },
      );
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

  function replaceMatchedColor(sourceLabel: string, targetLabel: string) {
    if (
      !result ||
      result.editingLocked ||
      !editorBaseCells.length ||
      sourceLabel === targetLabel
    ) {
      return;
    }

    const replacement = buildReplacementCell(
      targetLabel,
      paletteOptions,
      "paint",
      EMPTY_SELECTION_LABEL,
    );
    const nextCells = replaceLabelAcrossCells(editorBaseCells, sourceLabel, replacement);
    if (cellsEqual(editorBaseCells, nextCells)) {
      return;
    }

    const nextDisabledLabels = disabledResultLabels.filter(
      (label) => label !== sourceLabel && label !== targetLabel,
    );
    commitEditorSnapshot(nextCells, nextDisabledLabels);
  }

  function applyCellEdit(index: number, toolOverride?: EditTool) {
    if (
      !result ||
      result.editingLocked ||
      !editorBaseCells.length ||
      editorGridWidth <= 0 ||
      editorGridHeight <= 0
    ) {
      return;
    }

    const activeTool = toolOverride ?? editTool;

    if (activeTool === "pick") {
      const picked = renderedEditorCells[index];
      if (picked?.label) {
        setSelectedLabel(picked.label);
        if (!toolOverride) {
          handleEditToolChange("paint");
        }
      } else if (!toolOverride) {
        setSelectedLabel(EMPTY_SELECTION_LABEL);
        handleEditToolChange("erase");
      } else {
        setSelectedLabel(EMPTY_SELECTION_LABEL);
      }
      return;
    }

    if (activeTool === "pan" || activeTool === "zoom" || activeTool === "crop") {
      return;
    }

    const nextDisabledLabels =
      activeTool !== "erase" &&
      selectedLabel !== EMPTY_SELECTION_LABEL &&
      disabledResultLabels.includes(selectedLabel)
        ? disabledResultLabels.filter((label) => label !== selectedLabel)
        : undefined;

    if (nextDisabledLabels) {
      disabledResultLabelsRef.current = nextDisabledLabels;
      setDisabledResultLabels(nextDisabledLabels);
    }

    const replacement = buildReplacementCell(
      selectedLabel,
      paletteOptions,
      activeTool,
      EMPTY_SELECTION_LABEL,
    );
    const nextCells =
      activeTool === "fill"
        ? floodFillCells(
            editorBaseCells,
            editorGridWidth,
            editorGridHeight,
            index,
            replacement,
            fillTolerance,
          )
        : replaceBrushArea(
            editorBaseCells,
            editorGridWidth,
            editorGridHeight,
            index,
            replacement,
            brushSize,
          );

    if (cellsEqual(editorBaseCells, nextCells)) {
      return;
    }

    if (activeTool === "paint" || activeTool === "erase") {
      stageEditorDraft(nextCells);
      return;
    }

    commitEditorSnapshot(nextCells, nextDisabledLabels);
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
    window.localStorage.setItem(pindouBeadShapeStorageKey, pindouBeadShape);
  }, [pindouBeadShape]);

  useEffect(() => {
    window.localStorage.setItem(pindouBoardThemeStorageKey, pindouBoardTheme);
  }, [pindouBoardTheme]);

  useEffect(() => {
    resultUrlRef.current = result?.url ?? null;
  }, [result?.url]);

  async function importSharedChartCode(
    rawInput: string,
    options?: {
      isCancelled?: () => boolean;
    },
  ) {
    const serialized = extractSharedChartCode(rawInput);
    if (!serialized) {
      throw new Error(t.errorChartLinkInvalid);
    }

    const decoded = deserializeChartPayload(serialized);
    const paletteMap = new Map(
      getPaletteOptions(decoded.colorSystemId).map((entry) => [entry.label, entry.hex]),
    );
    const cells: EditableCell[] = decoded.cells.map((entry) => {
      if (!entry) {
        return { label: null, hex: null, source: null };
      }

      const hex = paletteMap.get(entry[0]);
      if (!hex) {
        throw new Error("Unsupported shared chart color label.");
      }

      return {
        label: entry[0],
        hex,
        source: entry[1] === 1 ? "manual" : "detected",
      };
    });
    const syntheticName = decoded.title?.trim() ? `${decoded.title.trim()}.png` : "shared-chart.png";
    const exported = await exportChartFromCells({
      cells,
      gridWidth: decoded.gridWidth,
      gridHeight: decoded.gridHeight,
      fileName: syntheticName,
      colorSystemId: decoded.colorSystemId,
      chartSettings: {
        chartTitle: decoded.title,
        saveMetadata: true,
        lockEditing: decoded.editingLocked,
      },
      messages: {
        canvasContextUnavailable: t.errorCanvasContextUnavailable,
        encodingFailed: t.errorEncodingFailed,
        chartSerializationTooManyColors: t.errorChartSerializationTooManyColors,
        chartQrTooLarge: t.errorChartQrTooLarge,
        chartQrCaption: t.chartQrCaption,
        chartTitle: t.chartTitle,
        chartMetaLine: t.chartMetaLine,
      },
    });

    if (options?.isCancelled?.()) {
      return;
    }

    applyColorSystemId(decoded.colorSystemId);
    setChartExportTitle(decoded.title ?? "");
    handleFileSelection(
      new File([exported.blob], exported.fileName, {
        type: "image/png",
      }),
    );
  }

  async function handleCopyChartShareCode() {
    if (!chartShareCode) {
      return;
    }

    try {
      await copyPlainText(chartShareCode);
      setChartShareCodeCopied(true);
      if (chartShareCodeCopiedTimeoutRef.current !== null) {
        window.clearTimeout(chartShareCodeCopiedTimeoutRef.current);
      }
      chartShareCodeCopiedTimeoutRef.current = window.setTimeout(() => {
        setChartShareCodeCopied(false);
        chartShareCodeCopiedTimeoutRef.current = null;
      }, 1800);
    } catch {
      // Keep the UI quiet if clipboard access is blocked.
    }
  }

  async function handleCopyChartShareLink() {
    if (!chartShareUrl) {
      return;
    }

    try {
      await copyPlainText(chartShareUrl);
      setChartShareLinkCopied(true);
      if (chartShareLinkCopiedTimeoutRef.current !== null) {
        window.clearTimeout(chartShareLinkCopiedTimeoutRef.current);
      }
      chartShareLinkCopiedTimeoutRef.current = window.setTimeout(() => {
        setChartShareLinkCopied(false);
        chartShareLinkCopiedTimeoutRef.current = null;
      }, 1800);
    } catch {
      // Keep the UI quiet if clipboard access is blocked.
    }
  }

  async function handleExportChartShareQr() {
    if (!chartShareUrl || chartShareQrBusy) {
      return;
    }

    setChartShareQrBusy(true);
    try {
      const qrBlob = await buildChartShareQrBlob(chartShareUrl, t.errorChartQrTooLarge);
      const baseName = normalizeDownloadBaseName(
        chartExportTitle || stripFileExtension(result?.fileName ?? ""),
      );
      triggerBlobDownload(qrBlob, `${baseName}-qr.png`);
    } catch (processingError) {
      setError(
        processingError instanceof Error ? processingError.message : t.processingFailed,
      );
    } finally {
      setChartShareQrBusy(false);
    }
  }

  function buildChartExportSettings(): ChartExportSettings {
    return {
      chartTitle: chartExportTitle.trim(),
      watermarkText: chartWatermarkText.trim(),
      watermarkImageDataUrl: chartWatermarkImageDataUrl,
      saveMetadata: effectiveChartSaveMetadata,
      lockEditing: chartLockEditing,
      includeGuides: chartIncludeGuides,
      showColorLabels: chartShowColorLabels,
      gaplessCells: chartGaplessCells,
      includeBoardPattern: chartIncludeBoardPattern,
      boardTheme: chartBoardTheme,
      includeLegend: chartIncludeLegend,
      includeQrCode: chartIncludeQrCode,
    };
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const serialized = new URLSearchParams(window.location.search).get("c");
    if (!serialized) {
      return;
    }
    if (sharedChartLoadAttemptedRef.current) {
      return;
    }
    sharedChartLoadAttemptedRef.current = true;

    let cancelled = false;
    void (async () => {
      try {
        await importSharedChartCode(serialized, {
          isCancelled: () => cancelled,
        });
        if (cancelled) {
          return;
        }
      } catch {
        if (!cancelled) {
          setError(t.errorChartLinkInvalid);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (file || !landingChartCode.trim()) {
      setLandingChartImportBusy(false);
      setLandingChartCodeInvalid(false);
      return;
    }

    const runId = landingChartImportRunIdRef.current + 1;
    landingChartImportRunIdRef.current = runId;
    let cancelled = false;
    setError(null);
    setLandingChartCodeInvalid(false);
    const importTimeoutId = window.setTimeout(() => {
      setLandingChartImportBusy(true);
      void importSharedChartCode(landingChartCode, {
        isCancelled: () => cancelled || landingChartImportRunIdRef.current !== runId,
      })
        .then(() => {
          if (cancelled || landingChartImportRunIdRef.current !== runId) {
            return;
          }
          setLandingChartCode("");
        })
        .catch(() => {
          // Ignore partial / invalid input while the user is still typing.
        })
        .finally(() => {
          if (!cancelled && landingChartImportRunIdRef.current === runId) {
            setLandingChartImportBusy(false);
          }
        });
    }, 180);
    const invalidTimeoutId = window.setTimeout(() => {
      if (cancelled || landingChartImportRunIdRef.current !== runId) {
        return;
      }

      if (!canDecodeSharedChartCode(landingChartCode)) {
        setLandingChartCodeInvalid(true);
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(importTimeoutId);
      window.clearTimeout(invalidTimeoutId);
    };
  }, [file, landingChartCode]);

  useEffect(() => {
    if (editorPanelMode !== "chart" || !result || busy || chartEditingLocked) {
      setChartPreviewBusy(false);
      setChartPreviewError(null);
      setChartPreviewUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
          if (chartPreviewUrlRef.current === previous) {
            chartPreviewUrlRef.current = null;
          }
        }
        return null;
      });
      return;
    }

    const runId = ++chartPreviewRunIdRef.current;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setChartPreviewBusy(true);
        setChartPreviewError(null);
        try {
          const exported = await exportChartFromCells({
            cells: renderedEditorCells,
            gridWidth: editorGridWidth,
            gridHeight: editorGridHeight,
            fileName: result.fileName,
            colorSystemId: effectiveColorSystemId,
            chartSettings: buildChartExportSettings(),
            messages: {
              canvasContextUnavailable: t.errorCanvasContextUnavailable,
              encodingFailed: t.errorEncodingFailed,
              chartSerializationTooManyColors: t.errorChartSerializationTooManyColors,
              chartQrTooLarge: t.errorChartQrTooLarge,
              chartQrCaption: t.chartQrCaption,
              chartTitle: t.chartTitle,
              chartMetaLine: t.chartMetaLine,
            },
          });

          if (chartPreviewRunIdRef.current !== runId) {
            return;
          }

          const nextUrl = URL.createObjectURL(exported.blob);
          setChartPreviewUrl((previous) => {
            if (previous) {
              URL.revokeObjectURL(previous);
            }
            chartPreviewUrlRef.current = nextUrl;
            return nextUrl;
          });
          setChartPreviewError(null);
        } catch (processingError) {
          if (chartPreviewRunIdRef.current !== runId) {
            return;
          }
          setChartPreviewUrl((previous) => {
            if (previous) {
              URL.revokeObjectURL(previous);
              if (chartPreviewUrlRef.current === previous) {
                chartPreviewUrlRef.current = null;
              }
            }
            return null;
          });
          setChartPreviewError(
            processingError instanceof Error && processingError.message
              ? processingError.message
              : t.chartSettingsPreviewError,
          );
        } finally {
          if (chartPreviewRunIdRef.current === runId) {
            setChartPreviewBusy(false);
          }
        }
      })();
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    busy,
    chartEditingLocked,
    editorGridHeight,
    editorGridWidth,
    editorPanelMode,
    effectiveColorSystemId,
    renderedEditorCells,
    result,
    chartExportTitle,
    chartWatermarkText,
    chartWatermarkImageDataUrl,
    effectiveChartSaveMetadata,
    chartLockEditing,
    chartIncludeGuides,
    chartShowColorLabels,
    chartGaplessCells,
    chartIncludeBoardPattern,
    chartBoardTheme,
    chartIncludeLegend,
    chartIncludeQrCode,
    locale,
  ]);

  useEffect(() => {
    return () => {
      if (chartPreviewUrlRef.current) {
        URL.revokeObjectURL(chartPreviewUrlRef.current);
        chartPreviewUrlRef.current = null;
      }
    };
  }, []);

  async function handleSaveChart() {
    if (!result || result.editingLocked || savingChart || busy) {
      return;
    }

    setSavingChart(true);
    try {
      const exported = await exportChartFromCells({
        cells: renderedEditorCells,
        gridWidth: editorGridWidth,
        gridHeight: editorGridHeight,
        fileName: result.fileName,
        colorSystemId: effectiveColorSystemId,
        chartSettings: buildChartExportSettings(),
        messages: {
          canvasContextUnavailable: t.errorCanvasContextUnavailable,
          encodingFailed: t.errorEncodingFailed,
          chartSerializationTooManyColors: t.errorChartSerializationTooManyColors,
          chartQrTooLarge: t.errorChartQrTooLarge,
          chartQrCaption: t.chartQrCaption,
          chartTitle: t.chartTitle,
          chartMetaLine: t.chartMetaLine,
        },
      });

      const url = URL.createObjectURL(exported.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exported.fileName;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (processingError) {
      setError(
        processingError instanceof Error ? processingError.message : t.processingFailed,
      );
    } finally {
      setSavingChart(false);
    }
  }

  saveChartRef.current = () => {
    void handleSaveChart();
  };

  async function handleChartWatermarkImageFile(file: File | null) {
    if (!file) {
      setChartWatermarkImageDataUrl(null);
      setChartWatermarkImageName("");
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setChartWatermarkImageDataUrl(dataUrl);
    setChartWatermarkImageName(file.name);
  }

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
    if (!pindouTimerRunning) {
      return;
    }

    pindouTimerStartedAtRef.current = Date.now();
    const intervalId = window.setInterval(() => {
      setPindouTimerElapsedMs((previous) => {
        const startedAt = pindouTimerStartedAtRef.current;
        if (!startedAt) {
          return previous;
        }
        const now = Date.now();
        pindouTimerStartedAtRef.current = now;
        return previous + (now - startedAt);
      });
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
      const startedAt = pindouTimerStartedAtRef.current;
      if (startedAt) {
        setPindouTimerElapsedMs((previous) => previous + Math.max(0, Date.now() - startedAt));
        pindouTimerStartedAtRef.current = null;
      }
    };
  }, [pindouTimerRunning]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      pindouTimerStorageKey,
      serializePindouTimerState({
        elapsedMs: pindouTimerElapsedMs,
        running: pindouTimerRunning,
        startedAt: pindouTimerStartedAtRef.current,
      }),
    );
  }, [pindouTimerElapsedMs, pindouTimerRunning]);

  function handlePindouTimerToggle() {
    if (pindouTimerRunning) {
      const startedAt = pindouTimerStartedAtRef.current;
      if (startedAt) {
        setPindouTimerElapsedMs((previous) => previous + Math.max(0, Date.now() - startedAt));
      }
      pindouTimerStartedAtRef.current = null;
      setPindouTimerRunning(false);
      return;
    }

    pindouTimerStartedAtRef.current = Date.now();
    setPindouTimerRunning(true);
  }

  function handlePindouTimerReset() {
    pindouTimerStartedAtRef.current = null;
    setPindouTimerRunning(false);
    setPindouTimerElapsedMs(0);
  }

  const handleGlobalEditorKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) {
      return;
    }
    if (isTypingElement(event.target)) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      if (editorHistoryIndexRef.current <= 0) {
        return;
      }
      event.preventDefault();
      handleUndo();
      return;
    }

    if (key === "y" || (key === "z" && event.shiftKey)) {
      if (
        editorHistoryIndexRef.current < 0 ||
        editorHistoryIndexRef.current >= editorHistoryRef.current.length - 1
      ) {
        return;
      }
      event.preventDefault();
      handleRedo();
      return;
    }

    if (key === "s") {
      if (!saveChartRef.current) {
        return;
      }
      event.preventDefault();
      saveChartRef.current();
    }
  });

  useEffect(() => {
    function handlePointerUp() {
      handleGlobalBrushPointerRelease();
    }

    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [handleGlobalBrushPointerRelease]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      handleGlobalEditorKeyDown(event);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleGlobalEditorKeyDown]);

  useEffect(() => {
    setSelectedLabel((previous) => {
      if (previous === EMPTY_SELECTION_LABEL || paletteOptions.some((entry) => entry.label === previous)) {
        return previous;
      }
      return paletteOptions[0]?.label ?? previous;
    });
  }, [colorSystemId]);

  useEffect(() => {
    setFftEdgeEnhanceOverrideLabel((previous) =>
      previous && paletteOptions.some((entry) => entry.label === previous) ? previous : null,
    );
  }, [colorSystemId, paletteOptions]);

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
      setEditorRefreshBusy(false);
      setError(null);
      disabledResultLabelsRef.current = [];
      setDisabledResultLabels([]);
      setCanvasCropSelection(null);
      editorHistoryRef.current = [];
      editorHistoryIndexRef.current = -1;
      editorDraftRef.current = null;
      setEditorHistory([]);
      setEditorHistoryIndex(-1);
      setEditorDraftCells(null);
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
      setEditorRefreshBusy(false);
      disabledResultLabelsRef.current = [];
      setDisabledResultLabels([]);
      setCanvasCropSelection(null);
      editorHistoryRef.current = [];
      editorHistoryIndexRef.current = -1;
      editorDraftRef.current = null;
      setEditorHistory([]);
      setEditorHistoryIndex(-1);
      setEditorDraftCells(null);
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
    setEditorRefreshBusy(false);

    const cancelScheduledProcessing = scheduleWorkspaceStageBusyProcessing(
      () => {
        if (runIdRef.current !== runId) {
          return;
        }
        setBusy(true);
      },
      () => {
        void (async () => {
          setError(null);
          await waitForNextPaint();
          await waitForNextPaint();

          try {
            const processed = await processImageFile(file, {
            colorSystemId: effectiveColorSystemId,
            grayscaleMode,
            gridMode,
            gridWidth: gridMode === "manual" ? manualWidth : undefined,
            gridHeight: gridMode === "manual" ? manualHeight : undefined,
            cropRect: cropMode ? cropRect : null,
            contrast,
            renderStyleBias,
            reduceColors,
            applyAutoReduceColorsDefault: !reduceColorsTouched,
            reduceTolerance,
            preSharpen,
            preSharpenStrength,
            fftEdgeEnhanceStrength,
            fftEdgeEnhanceOverrideLabel,
            messages: {
              nonPixelArtError: t.errorNonPixelArt,
              manualGridRequired: t.errorManualGridRequired,
              canvasContextUnavailable: t.errorCanvasContextUnavailable,
              encodingFailed: t.errorEncodingFailed,
              chartSerializationTooManyColors: t.errorChartSerializationTooManyColors,
              chartQrTooLarge: t.errorChartQrTooLarge,
              chartQrCaption: t.chartQrCaption,
              chartTitle: t.chartTitle,
              chartMetaLine: t.chartMetaLine,
            },
          });

            if (runIdRef.current !== runId) {
              return;
            }

            if (
              gridMode === "auto" &&
              activeAspectRatio &&
              hasLargeAspectRatioMismatch(
                activeAspectRatio,
                processed.gridWidth / processed.gridHeight,
              )
            ) {
              applyDetectedManualFallback(processed);
              setResult((previous) => {
                if (previous?.url) {
                  URL.revokeObjectURL(previous.url);
                }
                return null;
              });
              disabledResultLabelsRef.current = [];
              setDisabledResultLabels([]);
              setCanvasCropSelection(null);
              editorHistoryRef.current = [];
              editorHistoryIndexRef.current = -1;
              editorDraftRef.current = null;
              setEditorHistory([]);
              setEditorHistoryIndex(-1);
              setEditorDraftCells(null);
              setError(t.errorAutoGridAspectMismatch);
              return;
            }

            if (
              gridMode === "auto" &&
              (processed.detectionMode === "detected-wasm-chart" ||
                processed.detectionMode === "detected-wasm-pixel") &&
              (processed.gridWidth < 20 || processed.gridHeight < 20)
            ) {
              applyPlainManualFallback();
              setResult((previous) => {
                if (previous?.url) {
                  URL.revokeObjectURL(previous.url);
                }
                return null;
              });
              disabledResultLabelsRef.current = [];
              setDisabledResultLabels([]);
              setCanvasCropSelection(null);
              editorHistoryRef.current = [];
              editorHistoryIndexRef.current = -1;
              editorDraftRef.current = null;
              setEditorHistory([]);
              setEditorHistoryIndex(-1);
              setEditorDraftCells(null);
              setError(t.errorAutoGridTooSmall);
              return;
            }

            const url = URL.createObjectURL(processed.blob);
            const nextDisabledResultLabels = getDefaultDisabledResultLabels(
              grayscaleMode,
              getPaletteOptions(processed.colorSystemId, grayscaleMode),
            );
            disabledResultLabelsRef.current = nextDisabledResultLabels;
            setDisabledResultLabels(nextDisabledResultLabels);
            setCanvasCropSelection(null);
            if (
              !grayscaleMode &&
              !reduceColorsTouched &&
              reduceColors !== processed.effectiveReduceColors
            ) {
              setReduceColors(processed.effectiveReduceColors);
            }
            if (!grayscaleMode && processed.colorSystemId !== colorSystemId) {
              applyColorSystemId(processed.colorSystemId);
            }
            setChartLockEditing(processed.editingLocked);
            if (processed.editingLocked) {
              setChartSaveMetadata(true);
            }
            setEditorPanelMode(processed.editingLocked ? "pindou" : processed.preferredEditorMode);
            startTransition(() => {
              setResult((previous) => {
                if (previous?.url) {
                  URL.revokeObjectURL(previous.url);
                }
                return { ...processed, url };
              });
            });
            resetEditorHistory(processed.cells, {
              gridWidth: processed.gridWidth,
              gridHeight: processed.gridHeight,
            });

            if (processed.colors[0]?.label) {
              const processedPaletteOptions = getPaletteOptions(
                processed.colorSystemId,
                grayscaleMode,
              );
              setSelectedLabel((previous) =>
                previous === EMPTY_SELECTION_LABEL || processedPaletteOptions.some((entry) => entry.label === previous)
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
            disabledResultLabelsRef.current = [];
            setDisabledResultLabels([]);
            setCanvasCropSelection(null);
            editorHistoryRef.current = [];
            editorHistoryIndexRef.current = -1;
            editorDraftRef.current = null;
            setEditorHistory([]);
            setEditorHistoryIndex(-1);
            setEditorDraftCells(null);
            setError(
              processingError instanceof Error ? processingError.message : t.processingFailed,
            );
          } finally {
            if (runIdRef.current === runId) {
              setBusy(false);
            }
          }
        })();
      },
    );

    return () => {
      cancelScheduledProcessing();
    };
  }, [
    file,
    effectiveColorSystemId,
    grayscaleMode,
    gridMode,
    gridWidth,
    gridHeight,
    contrast,
    renderStyleBias,
    reduceColors,
    reduceColorsTouched,
    reduceTolerance,
    preSharpen,
    preSharpenStrength,
    fftEdgeEnhanceStrength,
    fftEdgeEnhanceOverrideLabel,
    cropMode,
    cropRect,
    activeAspectRatio,
    locale,
  ]);

  if (file && pindouFocusViewOpen) {
    return (
      <main className={clsx("min-h-screen transition-colors", theme.page)}>
        <div className="min-h-screen w-full overflow-hidden p-0">
          <Suspense
            fallback={
              <WorkspacePanelsSuspenseFallback
                isDark={isDark}
                busy={shouldShowWorkspacePanelsSuspenseLoading(Boolean(file), workspaceBusy)}
                readyHint={t.readyHint}
                minHeightClassName="min-h-screen"
                mobileApp={useMobileWorkspace}
              />
            }
          >
            <WorkspacePanels
            t={t}
            file={file}
            inputUrl={inputUrl}
            sourceBadge={sourceBadge}
            sourceFocusViewOpen={sourceFocusViewOpen}
            onSourceFocusViewOpenChange={setSourceFocusViewOpen}
            cropMode={cropMode}
            onCropModeChange={setCropMode}
            cropRect={cropRect}
            displayCropRect={previewCropRect}
            onCropChange={handleManualCropChange}
            result={result}
            busy={workspaceBusy}
            stageBusy={workspaceStageBusy}
            isDark={isDark}
            gridMode={gridMode}
            onGridModeChange={handleGridModeChange}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            onGridWidthChange={handleGridWidthChange}
            onGridHeightChange={handleGridHeightChange}
            followSourceRatio={followSourceRatio}
            onFollowSourceRatioChange={setFollowSourceRatio}
            grayscaleMode={grayscaleMode}
            onGrayscaleModeChange={handleGrayscaleModeChange}
            contrast={contrast}
            onContrastChange={handleContrastChange}
            renderStyleBias={renderStyleBias}
            onRenderStyleBiasChange={handleRenderStyleBiasChange}
            reduceColors={reduceColors}
            onReduceColorsChange={handleReduceColorsChange}
            reduceTolerance={reduceTolerance}
            onReduceToleranceChange={setReduceTolerance}
            preSharpen={preSharpen}
            onPreSharpenChange={setPreSharpen}
            preSharpenStrength={preSharpenStrength}
            onPreSharpenStrengthChange={setPreSharpenStrength}
            fftEdgeEnhanceStrength={fftEdgeEnhanceStrength}
            fftEdgeEnhanceOverrideLabel={fftEdgeEnhanceOverrideLabel}
            onFftEdgeEnhanceStrengthChange={setFftEdgeEnhanceStrength}
            onFftEdgeEnhanceOverrideLabelChange={setFftEdgeEnhanceOverrideLabel}
            onFileSelection={handleFileSelection}
            editTool={editTool}
            onEditToolChange={handleEditToolChange}
            editZoom={editZoom}
            onEditZoomChange={setEditZoom}
            editFlipHorizontal={editFlipHorizontal}
            onEditFlipHorizontalChange={setEditFlipHorizontal}
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
            onReplaceMatchedColor={replaceMatchedColor}
            selectedLabel={selectedLabel}
            onSelectedLabelChange={setSelectedLabel}
            colorSystemId={colorSystemId}
            lockColorSystem={false}
            onColorSystemIdChange={applyColorSystemId}
            paletteOptions={paletteOptions}
            currentCells={renderedEditorCells}
            editorGridWidth={editorGridWidth}
            editorGridHeight={editorGridHeight}
            onApplyCell={applyCellEdit}
            canvasCropSelection={canvasCropSelection}
            onCanvasCropSelectionChange={setCanvasCropSelection}
            onCanvasCropConfirm={handleCanvasCropConfirm}
            onCanvasCropCancel={handleCanvasCropCancel}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={editorHistoryIndex > 0}
            canRedo={editorHistoryIndex >= 0 && editorHistoryIndex < editorHistory.length - 1}
            paintActiveRef={paintActiveRef}
            focusViewOpen={pindouFocusViewOpen}
            onFocusViewOpenChange={handlePindouFocusViewOpenChange}
            focusOnly
            layout={useMobileWorkspace ? "mobile" : "desktop"}
            preferredEditorMode={editorPanelMode}
            preferredEditorModeSeed={inputUrl}
            onPreferredEditorModeChange={setEditorPanelMode}
            pindouFlipHorizontal={pindouFlipHorizontal}
            onPindouFlipHorizontalChange={setPindouFlipHorizontal}
            pindouShowLabels={pindouShowLabels}
            onPindouShowLabelsChange={setPindouShowLabels}
            pindouBeadShape={pindouBeadShape}
            onPindouBeadShapeChange={setPindouBeadShape}
            pindouBoardTheme={pindouBoardTheme}
            onPindouBoardThemeChange={setPindouBoardTheme}
            pindouTimerElapsedMs={pindouTimerElapsedMs}
            pindouTimerRunning={pindouTimerRunning}
            onPindouTimerToggle={handlePindouTimerToggle}
            onPindouTimerReset={handlePindouTimerReset}
            pindouZoom={pindouZoom}
            onPindouZoomChange={setPindouZoom}
            chartExportTitle={chartExportTitle}
            onChartExportTitleChange={setChartExportTitle}
            chartWatermarkText={chartWatermarkText}
            onChartWatermarkTextChange={setChartWatermarkText}
            chartWatermarkImageDataUrl={chartWatermarkImageDataUrl}
            chartWatermarkImageName={chartWatermarkImageName}
            onChartWatermarkImageFile={handleChartWatermarkImageFile}
            onChartWatermarkImageClear={() => {
              setChartWatermarkImageDataUrl(null);
              setChartWatermarkImageName("");
            }}
            editingLocked={chartEditingLocked}
            chartSaveMetadata={effectiveChartSaveMetadata}
            onChartSaveMetadataChange={setChartSaveMetadata}
            chartLockEditing={chartLockEditing}
            onChartLockEditingChange={setChartLockEditing}
            chartIncludeGuides={chartIncludeGuides}
            onChartIncludeGuidesChange={setChartIncludeGuides}
            chartShowColorLabels={chartShowColorLabels}
            onChartShowColorLabelsChange={setChartShowColorLabels}
            chartGaplessCells={chartGaplessCells}
            onChartGaplessCellsChange={setChartGaplessCells}
            chartIncludeBoardPattern={chartIncludeBoardPattern}
            onChartIncludeBoardPatternChange={setChartIncludeBoardPattern}
            chartBoardTheme={chartBoardTheme}
            onChartBoardThemeChange={setChartBoardTheme}
            chartIncludeLegend={chartIncludeLegend}
            onChartIncludeLegendChange={setChartIncludeLegend}
            chartIncludeQrCode={chartIncludeQrCode}
            onChartIncludeQrCodeChange={setChartIncludeQrCode}
            chartPreviewUrl={chartPreviewUrl}
            chartPreviewError={chartPreviewError}
            chartShareCode={chartShareCode}
            chartShareLinkCopied={chartShareLinkCopied}
            chartShareCodeCopied={chartShareCodeCopied}
            onCopyChartShareLink={handleCopyChartShareLink}
            onCopyChartShareCode={handleCopyChartShareCode}
            chartPreviewBusy={chartPreviewBusy}
            chartShareQrBusy={chartShareQrBusy}
            onExportChartShareQr={handleExportChartShareQr}
            onSaveChart={handleSaveChart}
            saveBusy={savingChart}
            />
          </Suspense>
        </div>
      </main>
    );
  }

  return (
    <main className={clsx("min-h-screen transition-colors", theme.page)}>
      <div
        className={clsx(
          "mx-auto max-w-[1760px]",
          useMobileWorkspace ? "px-0 pt-0" : "px-2 pt-3 sm:px-4 sm:pt-4 lg:px-6 lg:pt-6",
        )}
      >
        <div
          data-header-root
          className={clsx(
            useMobileWorkspace
              ? "fixed inset-x-0 top-0 z-[95] flex min-w-0 flex-nowrap items-center border-b px-3 backdrop-blur transition-colors"
              : "flex min-h-[44px] min-w-0 flex-nowrap items-center gap-1.5 rounded-[10px] border px-2 py-2 backdrop-blur transition-colors sm:min-h-0 sm:gap-3 sm:px-4",
            useMobileWorkspace ? "rounded-none border-x-0 border-t-0" : "",
            theme.controlShell,
          )}
          style={
            useMobileWorkspace
              ? {
                  minHeight: `${mobileHeaderChrome.minHeightPx}px`,
                  paddingTop: `calc(env(safe-area-inset-top) + ${mobileHeaderChrome.topInsetRem}rem)`,
                  paddingBottom: `${mobileHeaderChrome.verticalPaddingRem}rem`,
                }
              : undefined
          }
        >
          <div
            className={clsx(
              "h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border",
              useMobileWorkspace ? "hidden" : "hidden sm:flex",
              theme.pill,
            )}
          >
            <BrandLogo className="h-9 w-9" />
          </div>
          <div
            data-header-brand
            className={clsx(
              "flex min-w-0 items-center",
              useMobileWorkspace
                ? mobileHeaderLayout.centerBrand
                  ? "absolute left-1/2 -translate-x-1/2"
                  : "flex-1"
                : "translate-x-1 -translate-y-0.5 sm:translate-x-0 sm:flex-1 sm:-translate-y-0.5",
            )}
          >
            {useMobileWorkspace && mobileHeaderLayout.showBrandLogo ? (
              <span
                className={clsx(
                  "mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border",
                  theme.pill,
                )}
              >
                <BrandLogo className="h-5 w-5" />
              </span>
            ) : null}
            <h1 className="min-w-0 leading-none">
              <span className="sr-only">{APP_BRAND_TITLE}</span>
              <span
                className={clsx("block", useMobileWorkspace ? "" : "w-[84px] sm:w-auto")}
                style={useMobileWorkspace ? { width: `${mobileHeaderChrome.brandWidthPx}px` } : undefined}
              >
                <BrandWordmark
                  className={clsx(
                    "block h-auto max-w-none",
                    useMobileWorkspace ? "w-full" : "w-[84px] sm:h-10 sm:w-auto",
                  )}
                  isDark={isDark}
                />
              </span>
            </h1>
          </div>
          <div
            className={clsx(
              useMobileWorkspace && mobileHeaderLayout.overlayTrailingControls
                ? "absolute right-3 top-1/2 z-10 -translate-y-1/2"
                : "ml-auto",
              mobileHeaderLayout.usePlainIconControls
                ? clsx("flex shrink-0 items-center gap-1.5", useMobileWorkspace ? "" : "md:hidden")
                : clsx(
                    "flex shrink-0 items-center rounded-[10px] border px-0.5 py-0.5 backdrop-blur",
                    useMobileWorkspace ? "" : "md:hidden",
                  ),
              mobileHeaderLayout.usePlainIconControls ? "" : theme.controlShell,
            )}
          >
            <div
              className={clsx(
                mobileHeaderLayout.usePlainIconControls
                  ? "flex items-center gap-1.5"
                  : clsx("flex items-center gap-1 rounded-[8px] p-0.5", theme.controlSegment),
              )}
            >
              <button
                aria-label={t.themeLabel}
                className={clsx(
                  "flex items-center justify-center transition",
                  mobileHeaderLayout.usePlainIconControls
                    ? clsx(
                        "rounded-none border-0 bg-transparent p-0",
                        isDark ? "text-stone-300" : "text-[#6c573f]",
                      )
                    : "rounded-[8px] border border-[#d8c2a3] bg-[#f3dec0] text-[#24170f]",
                )}
                onClick={() =>
                  setThemeMode(themeMode === "light" ? "dark" : themeMode === "dark" ? "system" : "light")
                }
                style={{
                  width: `${mobileHeaderChrome.controlButtonPx}px`,
                  height: `${mobileHeaderChrome.controlButtonPx}px`,
                }}
                title={t.themeLabel}
                type="button"
              >
                {themeMode === "light" ? (
                  <Sun className="h-4 w-4" />
                ) : themeMode === "dark" ? (
                  <Moon className="h-4 w-4" />
                ) : (
                  <LaptopMinimal className="h-4 w-4" />
                )}
              </button>
              <button
                aria-label={t.languageLabel}
                className={clsx(
                  "flex items-center justify-center transition",
                  mobileHeaderLayout.usePlainIconControls
                    ? clsx(
                        "rounded-none border-0 bg-transparent p-0",
                        isDark ? "text-stone-300" : "text-[#6c573f]",
                      )
                    : "rounded-[8px] border border-[#d8c2a3] bg-[#f3dec0] text-[10px] font-semibold text-[#24170f]",
                )}
                onClick={() => setLocale(locale === "zh-CN" ? "en-US" : "zh-CN")}
                style={{
                  width: `${mobileHeaderChrome.controlButtonPx}px`,
                  height: `${mobileHeaderChrome.controlButtonPx}px`,
                }}
                title={t.languageLabel}
                type="button"
              >
                {mobileHeaderLayout.usePlainIconControls ? (
                  <Languages className="h-4 w-4" />
                ) : locale === "zh-CN" ? (
                  "中"
                ) : (
                  "En"
                )}
              </button>
            </div>
          </div>
          <div
            data-header-controls-desktop
            className={clsx("ml-auto hidden shrink-0 items-center gap-1", useMobileWorkspace ? "" : "md:flex")}
          >
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

      <div style={useMobileWorkspace ? { paddingTop: mobileHeaderOffset } : undefined}>
      {topError ? (
        <div className="mx-auto max-w-[1760px] px-4 pt-3 lg:px-6">
          <div className={clsx("rounded-[10px] border px-4 py-3 text-sm", theme.errorBox)}>
            {topError}
          </div>
        </div>
      ) : null}

      {!file ? (
        <div className={useMobileWorkspace ? mobileLandingLayout.wrapperClassName : "mx-auto flex min-h-[calc(100vh-8rem)] max-w-[1760px] items-center justify-center px-4 pb-8 pt-6 lg:px-6"}>
          <section
            className={clsx(
              useMobileWorkspace ? mobileLandingLayout.cardClassName : "w-full max-w-[640px] rounded-[14px] border p-6 text-center backdrop-blur transition-all sm:p-8",
              theme.panel,
              landingDragActive
                ? "scale-[1.01] border-[#7F684D] shadow-[0_18px_54px_rgba(54,34,16,0.16)]"
                : "",
            )}
            onDragEnter={handleLandingDragEnter}
            onDragOver={handleLandingDragOver}
            onDragLeave={handleLandingDragLeave}
            onDrop={handleLandingDrop}
          >
            <div className={mobileLandingLayout.contentClassName}>
              <div className={clsx(useMobileWorkspace && mobileLandingLayout.compactLandscape ? "text-left" : "text-center")}>
                <div className={clsx("flex items-center", useMobileWorkspace && mobileLandingLayout.compactLandscape ? "justify-start" : "justify-center")}>
                  <div className={clsx("flex items-center justify-center rounded-[10px] border", useMobileWorkspace && mobileLandingLayout.compactLandscape ? "h-11 w-11" : "h-14 w-14 sm:h-16 sm:w-16")}>
                    <ImageUp className={clsx(useMobileWorkspace && mobileLandingLayout.compactLandscape ? "h-5 w-5" : "h-6 w-6 sm:h-7 sm:w-7", theme.cardTitle)} />
                  </div>
                </div>
                <h2 className={clsx(theme.cardTitle, useMobileWorkspace && mobileLandingLayout.compactLandscape ? "mt-3 text-[1.7rem] font-semibold leading-tight" : "mt-5 text-2xl font-semibold sm:text-3xl")}>
                  {t.sourceLandingTitle}
                </h2>
                {t.sourcePrivacyNote ? (
                  <p className={clsx(theme.cardMuted, useMobileWorkspace && mobileLandingLayout.compactLandscape ? "mt-2 text-xs leading-relaxed" : "mt-2 text-xs")}>
                    {t.sourcePrivacyNote}
                  </p>
                ) : null}

                <label
                  className={clsx(
                    "flex cursor-pointer items-center justify-center gap-2 rounded-md border text-sm font-medium transition",
                    useMobileWorkspace && mobileLandingLayout.compactLandscape
                      ? "mt-4 w-full max-w-[280px] px-4 py-2.5"
                      : "mx-auto mt-6 max-w-[320px] px-5 py-3",
                    theme.primaryButton,
                  )}
                >
                  <ImageUp className="h-4 w-4" />
                  <span>{t.sourceChooseImage}</span>
                  <input
                    className="hidden"
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleFileSelection(event.target.files?.[0] ?? null)}
                  />
                </label>
                <p className={clsx("text-xs transition-colors", useMobileWorkspace && mobileLandingLayout.compactLandscape ? "mt-2" : "mt-3", landingDragActive ? theme.cardTitle : theme.cardMuted)}>
                  {landingDragActive ? t.sourceDropActive : t.sourceDropHint}
                </p>
              </div>

              <div className={clsx(useMobileWorkspace && mobileLandingLayout.compactLandscape ? "min-w-0" : "mt-6 w-full")}>
                <div className="flex items-center gap-4">
                  <div className={clsx("h-px flex-1", theme.divider)} />
                  <p className={clsx("shrink-0 text-sm font-semibold", theme.cardTitle)}>
                    {t.sourceChartCodeTitle}
                  </p>
                  <div className={clsx("h-px flex-1", theme.divider)} />
                </div>
                <textarea
                  className={clsx(
                    "resize-none transition-[border-color,background-color,box-shadow,transform]",
                    useMobileWorkspace && mobileLandingLayout.compactLandscape ? "mt-3 min-h-[168px]" : "mt-4",
                    chartCodeInputClassName,
                    landingChartCodeInvalid &&
                      (isDark
                        ? "animate-[pindou-input-shake_0.42s_ease-in-out_2] border-rose-300/45 bg-[#2a1116] text-rose-100 shadow-[0_0_0_1px_rgba(253,164,175,0.16)]"
                        : "animate-[pindou-input-shake_0.42s_ease-in-out_2] border-rose-500/45 bg-[#fff0f1] shadow-[0_0_0_1px_rgba(244,63,94,0.14)]"),
                    landingChartImportBusy && "opacity-70",
                  )}
                  aria-invalid={landingChartCodeInvalid}
                  placeholder={t.sourceChartCodePlaceholder}
                  readOnly={landingChartImportBusy}
                  value={landingChartCode}
                  onChange={(event) => setLandingChartCode(event.target.value)}
                />
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div
          className={clsx(
            useMobileWorkspace
              ? "mx-auto flex min-h-0 max-w-[1760px] flex-col px-2 pb-5 pt-3 lg:px-6 lg:pt-4"
              : "mx-auto grid min-h-0 max-w-[1760px] gap-4 px-4 pb-6 pt-4 lg:grid-cols-[minmax(320px,22vw)_minmax(0,1fr)] lg:gap-6 lg:px-6 lg:pt-4",
            editorPanelMode === "chart"
              ? "lg:items-start lg:overflow-visible"
              : "lg:h-[calc(100vh-5rem)] lg:overflow-hidden",
          )}
        >
          {!useMobileWorkspace ? (
            <SidebarPanel
              t={t}
              file={file}
              inputUrl={inputUrl}
              sourceBadge={sourceBadge}
              sourceFocusViewOpen={sourceFocusViewOpen}
              onSourceFocusViewOpenChange={setSourceFocusViewOpen}
              cropMode={cropMode}
              onCropModeChange={setCropMode}
              cropRect={cropRect}
              displayCropRect={previewCropRect}
              onCropChange={handleManualCropChange}
              busy={busy}
              isDark={isDark}
              gridMode={gridMode}
              onGridModeChange={handleGridModeChange}
              gridWidth={gridWidth}
              gridHeight={gridHeight}
              onGridWidthChange={handleGridWidthChange}
              onGridHeightChange={handleGridHeightChange}
              followSourceRatio={followSourceRatio}
              onFollowSourceRatioChange={setFollowSourceRatio}
              paletteOptions={paletteOptions}
              grayscaleMode={grayscaleMode}
              onGrayscaleModeChange={handleGrayscaleModeChange}
              contrast={contrast}
              onContrastChange={handleContrastChange}
              renderStyleBias={renderStyleBias}
              onRenderStyleBiasChange={handleRenderStyleBiasChange}
              reduceColors={reduceColors}
              onReduceColorsChange={handleReduceColorsChange}
              reduceTolerance={reduceTolerance}
              onReduceToleranceChange={setReduceTolerance}
              preSharpen={preSharpen}
              onPreSharpenChange={setPreSharpen}
              preSharpenStrength={preSharpenStrength}
              onPreSharpenStrengthChange={setPreSharpenStrength}
              fftEdgeEnhanceStrength={fftEdgeEnhanceStrength}
              fftEdgeEnhanceOverrideLabel={fftEdgeEnhanceOverrideLabel}
              onFftEdgeEnhanceStrengthChange={setFftEdgeEnhanceStrength}
              onFftEdgeEnhanceOverrideLabelChange={setFftEdgeEnhanceOverrideLabel}
              onFileSelection={handleFileSelection}
            />
          ) : null}

          <Suspense
            fallback={
              <WorkspacePanelsSuspenseFallback
                isDark={isDark}
                busy={shouldShowWorkspacePanelsSuspenseLoading(Boolean(file), workspaceBusy)}
                readyHint={t.readyHint}
                mobileApp={useMobileWorkspace}
              />
            }
          >
            <WorkspacePanels
            t={t}
            file={file}
            inputUrl={inputUrl}
            sourceBadge={sourceBadge}
            sourceFocusViewOpen={sourceFocusViewOpen}
            onSourceFocusViewOpenChange={setSourceFocusViewOpen}
            cropMode={cropMode}
            onCropModeChange={setCropMode}
            cropRect={cropRect}
            displayCropRect={previewCropRect}
            onCropChange={handleManualCropChange}
            result={result}
            busy={workspaceBusy}
            stageBusy={workspaceStageBusy}
            isDark={isDark}
            gridMode={gridMode}
            onGridModeChange={handleGridModeChange}
            gridWidth={gridWidth}
            gridHeight={gridHeight}
            onGridWidthChange={handleGridWidthChange}
            onGridHeightChange={handleGridHeightChange}
            followSourceRatio={followSourceRatio}
            onFollowSourceRatioChange={setFollowSourceRatio}
            grayscaleMode={grayscaleMode}
            onGrayscaleModeChange={handleGrayscaleModeChange}
            contrast={contrast}
            onContrastChange={handleContrastChange}
            renderStyleBias={renderStyleBias}
            onRenderStyleBiasChange={handleRenderStyleBiasChange}
            reduceColors={reduceColors}
            onReduceColorsChange={handleReduceColorsChange}
            reduceTolerance={reduceTolerance}
            onReduceToleranceChange={setReduceTolerance}
            preSharpen={preSharpen}
            onPreSharpenChange={setPreSharpen}
            preSharpenStrength={preSharpenStrength}
            onPreSharpenStrengthChange={setPreSharpenStrength}
            fftEdgeEnhanceStrength={fftEdgeEnhanceStrength}
            fftEdgeEnhanceOverrideLabel={fftEdgeEnhanceOverrideLabel}
            onFftEdgeEnhanceStrengthChange={setFftEdgeEnhanceStrength}
            onFftEdgeEnhanceOverrideLabelChange={setFftEdgeEnhanceOverrideLabel}
            onFileSelection={handleFileSelection}
            editTool={editTool}
            onEditToolChange={handleEditToolChange}
            editZoom={editZoom}
            onEditZoomChange={setEditZoom}
            editFlipHorizontal={editFlipHorizontal}
            onEditFlipHorizontalChange={setEditFlipHorizontal}
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
            onReplaceMatchedColor={replaceMatchedColor}
            selectedLabel={selectedLabel}
            onSelectedLabelChange={setSelectedLabel}
            colorSystemId={colorSystemId}
            lockColorSystem={false}
            onColorSystemIdChange={applyColorSystemId}
            paletteOptions={paletteOptions}
            currentCells={renderedEditorCells}
            editorGridWidth={editorGridWidth}
            editorGridHeight={editorGridHeight}
            onApplyCell={applyCellEdit}
            canvasCropSelection={canvasCropSelection}
            onCanvasCropSelectionChange={setCanvasCropSelection}
            onCanvasCropConfirm={handleCanvasCropConfirm}
            onCanvasCropCancel={handleCanvasCropCancel}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={editorHistoryIndex > 0}
            canRedo={editorHistoryIndex >= 0 && editorHistoryIndex < editorHistory.length - 1}
            paintActiveRef={paintActiveRef}
            focusViewOpen={pindouFocusViewOpen}
            onFocusViewOpenChange={handlePindouFocusViewOpenChange}
            layout={useMobileWorkspace ? "mobile" : "desktop"}
            preferredEditorMode={editorPanelMode}
            preferredEditorModeSeed={inputUrl}
            onPreferredEditorModeChange={setEditorPanelMode}
            pindouFlipHorizontal={pindouFlipHorizontal}
            onPindouFlipHorizontalChange={setPindouFlipHorizontal}
            pindouShowLabels={pindouShowLabels}
            onPindouShowLabelsChange={setPindouShowLabels}
            pindouBeadShape={pindouBeadShape}
            onPindouBeadShapeChange={setPindouBeadShape}
            pindouBoardTheme={pindouBoardTheme}
            onPindouBoardThemeChange={setPindouBoardTheme}
            pindouTimerElapsedMs={pindouTimerElapsedMs}
            pindouTimerRunning={pindouTimerRunning}
            onPindouTimerToggle={handlePindouTimerToggle}
            onPindouTimerReset={handlePindouTimerReset}
            pindouZoom={pindouZoom}
            onPindouZoomChange={setPindouZoom}
            chartExportTitle={chartExportTitle}
            onChartExportTitleChange={setChartExportTitle}
            chartWatermarkText={chartWatermarkText}
            onChartWatermarkTextChange={setChartWatermarkText}
            chartWatermarkImageDataUrl={chartWatermarkImageDataUrl}
            chartWatermarkImageName={chartWatermarkImageName}
            onChartWatermarkImageFile={handleChartWatermarkImageFile}
            onChartWatermarkImageClear={() => {
              setChartWatermarkImageDataUrl(null);
              setChartWatermarkImageName("");
            }}
            editingLocked={chartEditingLocked}
            chartSaveMetadata={effectiveChartSaveMetadata}
            onChartSaveMetadataChange={setChartSaveMetadata}
            chartLockEditing={chartLockEditing}
            onChartLockEditingChange={setChartLockEditing}
            chartIncludeGuides={chartIncludeGuides}
            onChartIncludeGuidesChange={setChartIncludeGuides}
            chartShowColorLabels={chartShowColorLabels}
            onChartShowColorLabelsChange={setChartShowColorLabels}
            chartGaplessCells={chartGaplessCells}
            onChartGaplessCellsChange={setChartGaplessCells}
            chartIncludeBoardPattern={chartIncludeBoardPattern}
            onChartIncludeBoardPatternChange={setChartIncludeBoardPattern}
            chartBoardTheme={chartBoardTheme}
            onChartBoardThemeChange={setChartBoardTheme}
            chartIncludeLegend={chartIncludeLegend}
            onChartIncludeLegendChange={setChartIncludeLegend}
            chartIncludeQrCode={chartIncludeQrCode}
            onChartIncludeQrCodeChange={setChartIncludeQrCode}
            chartPreviewUrl={chartPreviewUrl}
            chartPreviewError={chartPreviewError}
            chartShareCode={chartShareCode}
            chartShareLinkCopied={chartShareLinkCopied}
            chartShareCodeCopied={chartShareCodeCopied}
            onCopyChartShareLink={handleCopyChartShareLink}
            onCopyChartShareCode={handleCopyChartShareCode}
            chartPreviewBusy={chartPreviewBusy}
            chartShareQrBusy={chartShareQrBusy}
            onExportChartShareQr={handleExportChartShareQr}
            onSaveChart={handleSaveChart}
            saveBusy={savingChart}
            />
          </Suspense>
        </div>
      )}
      </div>

      {file && sourceFocusViewOpen ? (
        <div
          ref={sourceFocusOverlayRef}
          tabIndex={-1}
          className="fixed inset-0 z-[80] bg-black/45 p-3 backdrop-blur-[2px] outline-none sm:p-5"
        >
          <div className="mx-auto flex h-full max-w-[1760px] min-w-0 flex-col gap-3">
            <div className="flex justify-end">
              <button
                className={clsx(
                  "z-[81] flex h-10 w-10 items-center justify-center rounded-md border shadow-sm backdrop-blur",
                  theme.pill,
                )}
                aria-label={t.sourceExitFocus}
                onClick={() => setSourceFocusViewOpen(false)}
                title={t.sourceExitFocus}
                type="button"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
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
              onFileSelection={handleFileSelection}
              cropReset={t.cropReset}
              cropEdit={t.cropEdit}
              cropMode={cropMode}
              onCropModeChange={setCropMode}
              cropRect={cropRect}
              displayCropRect={previewCropRect}
              onCropChange={handleManualCropChange}
              isDark={isDark}
              focusViewOpen={sourceFocusViewOpen}
              onFocusViewOpenChange={setSourceFocusViewOpen}
              focusOnly
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}

