import clsx from "clsx";
import { PaintBucket, Pipette } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import type { EditableCell, NormalizedCropRect } from "../lib/chart-processor";
import { getPindouBoardThemeShades, type PindouBeadShape, type PindouBoardTheme } from "../lib/pindou-board-theme";
import { getThemeClasses } from "../lib/theme";
import { getDesktopContentFitViewportScale } from "./pixel-editor-layout";

import {
  createCanvasCropRectFromCellIndices,
  type CanvasCropRect,
  type EditTool,
} from "../lib/editor-utils";

type EditorPanelMode = "edit" | "pindou";
const PINDOU_STAGE_PADDING_CELLS = 5;

export function CanvasStage({
  cells,
  gridWidth,
  gridHeight,
  emptyPixelLabel,
  inputUrl,
  overlayCropRect,
  overlayEnabled,
  isDark,
  stageMode,
  editTool = "paint",
  brushSize = 1,
  selectedHex = null,
  canvasCropSelection = null,
  focusedLabel,
  onFocusLabelChange,
  onApplyCell,
  onCanvasCropSelectionChange,
  paintActiveRef,
  focusOnly = false,
  flipHorizontal = false,
  showPindouLabels = false,
  pindouBeadShape = "square",
  pindouBoardTheme = "gray",
  editZoom = 1,
  onEditZoomChange,
  pindouZoom = 1,
  onPindouZoomChange,
  busy = false,
  onStageEngage,
  onStageDisengage,
  onPindouStageTap,
  viewportClassName,
  embeddedInPanel = false,
  preferContentFit = false,
}: {
  cells: EditableCell[];
  gridWidth: number;
  gridHeight: number;
  emptyPixelLabel: string;
  inputUrl: string | null;
  overlayCropRect: NormalizedCropRect | null;
  overlayEnabled: boolean;
  isDark: boolean;
  stageMode: EditorPanelMode;
  editTool?: EditTool;
  brushSize?: number;
  selectedHex?: string | null;
  canvasCropSelection?: CanvasCropRect | null;
  focusedLabel?: string | null;
  onFocusLabelChange?: (label: string | null) => void;
  onApplyCell?: (index: number, toolOverride?: EditTool) => void;
  onCanvasCropSelectionChange?: (cropRect: CanvasCropRect | null) => void;
  paintActiveRef: MutableRefObject<boolean>;
  focusOnly?: boolean;
  flipHorizontal?: boolean;
  showPindouLabels?: boolean;
  pindouBeadShape?: PindouBeadShape;
  pindouBoardTheme?: PindouBoardTheme;
  editZoom?: number;
  onEditZoomChange?: (value: number) => void;
  pindouZoom?: number;
  onPindouZoomChange?: (value: number) => void;
  busy?: boolean;
  onStageEngage?: () => void;
  onStageDisengage?: () => void;
  onPindouStageTap?: () => void;
  viewportClassName?: string;
  embeddedInPanel?: boolean;
  preferContentFit?: boolean;
}) {
  const theme = getThemeClasses(isDark);
  const stageViewportRef = useRef<HTMLDivElement | null>(null);
  const stageSurfaceRef = useRef<HTMLDivElement | null>(null);
  const stageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pinchStateRef = useRef<{ distance: number; zoom: number } | null>(null);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const touchPanStateRef = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
    cellIndex: number | null;
  } | null>(null);
  const panStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
    cellIndex: number | null;
  } | null>(null);
  const drawPointerIdRef = useRef<number | null>(null);
  const cropPointerStateRef = useRef<{
    pointerId: number;
    anchorCellIndex: number;
  } | null>(null);
  const lastAppliedCellIndexRef = useRef<number | null>(null);
  const suppressTapUntilRef = useRef(0);

  const [overlayImage, setOverlayImage] = useState<HTMLImageElement | null>(null);
  const [stageViewport, setStageViewport] = useState({ width: 0, height: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [altPickActive, setAltPickActive] = useState(false);
  const [hoveredCellIndex, setHoveredCellIndex] = useState<number | null>(null);
  const [cursorPreview, setCursorPreview] = useState({ x: 0, y: 0, visible: false });
  const stageInset = typeof window !== "undefined" && window.innerWidth < 640 ? 16 : 24;
  const isMobileUserAgent = useMemo(() => {
    if (typeof navigator === "undefined") {
      return false;
    }
    return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent ?? "");
  }, []);
  const showCanvasStatusBadge = !(stageMode === "pindou" && focusOnly && isMobileUserAgent);

  function syncAltPickState(nextActive: boolean) {
    setAltPickActive((previous) => (previous === nextActive ? previous : nextActive));
  }

  useEffect(() => {
    function syncViewport() {
      if (!stageViewportRef.current) {
        return;
      }

      const width = Math.max(0, stageViewportRef.current.clientWidth - stageInset);
      const height = Math.max(0, stageViewportRef.current.clientHeight - stageInset);
      setStageViewport((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    }

    syncViewport();
    const observer = new ResizeObserver(() => syncViewport());
    if (stageViewportRef.current) {
      observer.observe(stageViewportRef.current);
    }
    window.addEventListener("resize", syncViewport);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncViewport);
    };
  }, [focusOnly, stageInset]);

  useEffect(() => {
    if (!inputUrl) {
      setOverlayImage(null);
      return;
    }

    const image = new Image();
    image.decoding = "async";
    image.onload = () => setOverlayImage(image);
    image.onerror = () => setOverlayImage(null);
    image.src = inputUrl;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [inputUrl]);

  const gridGap = 1;
  const pindouPaddingCells = stageMode === "pindou" ? PINDOU_STAGE_PADDING_CELLS : 0;
  const displayGridWidth = gridWidth + pindouPaddingCells * 2;
  const displayGridHeight = gridHeight + pindouPaddingCells * 2;
  const contentFitViewportScale = preferContentFit
    ? getDesktopContentFitViewportScale(stageViewport.width + stageInset)
    : 1;
  const fitViewportWidth = stageViewport.width * contentFitViewportScale;
  const fitViewportHeight = stageViewport.height * contentFitViewportScale;
  const cellSize = calculateStageCellSize(displayGridWidth, displayGridHeight, fitViewportWidth, fitViewportHeight);
  const stageWidth = displayGridWidth * cellSize + Math.max(0, displayGridWidth - 1) * gridGap;
  const stageHeight = displayGridHeight * cellSize + Math.max(0, displayGridHeight - 1) * gridGap;
  const stageScale = calculateStageScale(stageWidth, stageHeight, fitViewportWidth, fitViewportHeight);
  const effectiveScale = stageMode === "pindou" ? stageScale * pindouZoom : stageScale * editZoom;
  const scaledCellSize = cellSize * effectiveScale;
  const scaledGap = gridGap * effectiveScale;
  const stagePitch = scaledCellSize + scaledGap;
  const scaledStageWidth = stageWidth * effectiveScale;
  const scaledStageHeight = stageHeight * effectiveScale;
  const axisGutter = stageMode === "pindou" ? Math.max(22, Math.round(26 * stageScale)) : 0;
  const topGutter = stageMode === "pindou" ? axisGutter : 0;
  const leftGutter = stageMode === "pindou" ? axisGutter : 0;
  const totalStageWidth = scaledStageWidth + leftGutter;
  const totalStageHeight = scaledStageHeight + topGutter;
  const canPanStage =
    (stageMode === "pindou" || stageMode === "edit") &&
    stageViewport.width > 0 &&
    stageViewport.height > 0 &&
    totalStageWidth > 0 &&
    totalStageHeight > 0;
  const effectiveEditTool =
    stageMode === "edit" && altPickActive && !spacePanActive ? "pick" : editTool;
  const cropToolActive = stageMode === "edit" && effectiveEditTool === "crop";
  const panToolActive = stageMode === "edit" && effectiveEditTool === "pan";
  const effectivePanActive = stageMode === "edit" ? panToolActive || spacePanActive : false;
  const zoomToolActive = stageMode === "edit" && effectiveEditTool === "zoom";
  const showBrushCursor =
    stageMode === "edit" &&
    !spacePanActive &&
    (effectiveEditTool === "paint" || effectiveEditTool === "erase");
  const showFillCursor = stageMode === "edit" && !spacePanActive && effectiveEditTool === "fill";
  const showPickCursor = stageMode === "edit" && !spacePanActive && effectiveEditTool === "pick";
  const brushPreviewSize = Math.max(18, Math.round(brushSize * (cellSize + gridGap) * stageScale + 10));
  const panLimits = useMemo(
    () => calculateStagePanLimits(totalStageWidth, totalStageHeight, stageViewport.width, stageViewport.height),
    [totalStageWidth, totalStageHeight, stageViewport.width, stageViewport.height],
  );
  const hoveredCell = hoveredCellIndex === null ? null : cells[hoveredCellIndex] ?? null;
  const pickPreviewHex = hoveredCell?.hex ?? (isDark ? "#1C1712" : "#F7F4EE");
  const pickPreviewLabel = hoveredCell?.label ?? emptyPixelLabel;
  const pickPreviewTextColor = isDark ? "#FFFFFF" : "#111111";
  const canvasCropDisplayRect = useMemo(() => {
    if (stageMode !== "edit" || !canvasCropSelection) {
      return null;
    }

    const displayColumn = flipHorizontal
      ? gridWidth - canvasCropSelection.left - canvasCropSelection.width
      : canvasCropSelection.left;

    return {
      x: leftGutter + displayColumn * stagePitch,
      y: topGutter + canvasCropSelection.top * stagePitch,
      width:
        canvasCropSelection.width * scaledCellSize +
        Math.max(0, canvasCropSelection.width - 1) * scaledGap,
      height:
        canvasCropSelection.height * scaledCellSize +
        Math.max(0, canvasCropSelection.height - 1) * scaledGap,
    };
  }, [
    canvasCropSelection,
    flipHorizontal,
    gridWidth,
    leftGutter,
    scaledCellSize,
    scaledGap,
    stageMode,
    stagePitch,
    topGutter,
  ]);

  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

  useEffect(() => {
    setPanOffset((previous) => clampStagePanOffset(previous, panLimits));
  }, [panLimits.maxX, panLimits.maxY]);

  useEffect(() => {
    function clearStroke() {
      drawPointerIdRef.current = null;
      cropPointerStateRef.current = null;
      lastAppliedCellIndexRef.current = null;
    }
    window.addEventListener("pointerup", clearStroke);
    window.addEventListener("pointercancel", clearStroke);
    return () => {
      window.removeEventListener("pointerup", clearStroke);
      window.removeEventListener("pointercancel", clearStroke);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (stageMode !== "edit") {
        return;
      }
      if (isTypingElement(event.target)) {
        return;
      }

      if (event.code === "Space" && effectiveEditTool !== "pan") {
        event.preventDefault();
        setSpacePanActive(true);
        return;
      }

      if (event.key === "Alt") {
        syncAltPickState(true);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        setSpacePanActive(false);
      }

      if (!event.altKey || event.key === "Alt" || event.code === "AltLeft" || event.code === "AltRight") {
        syncAltPickState(false);
      }
    }

    function handleBlur() {
      setSpacePanActive(false);
      syncAltPickState(false);
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") {
        syncAltPickState(false);
      }
    }

    function handlePointerModifierSync(event: PointerEvent) {
      syncAltPickState(event.altKey);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("pointerdown", handlePointerModifierSync, true);
    window.addEventListener("pointermove", handlePointerModifierSync, true);
    window.addEventListener("pointerup", handlePointerModifierSync, true);
    window.addEventListener("pointercancel", handlePointerModifierSync, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("pointerdown", handlePointerModifierSync, true);
      window.removeEventListener("pointermove", handlePointerModifierSync, true);
      window.removeEventListener("pointerup", handlePointerModifierSync, true);
      window.removeEventListener("pointercancel", handlePointerModifierSync, true);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [stageMode, effectiveEditTool]);

  const resolveCellIndex = (clientX: number, clientY: number) =>
    resolveStageCellIndexFromClientPoint(
      clientX,
      clientY,
      stageSurfaceRef.current,
      leftGutter,
      topGutter,
      scaledStageWidth,
      scaledStageHeight,
      stagePitch,
      scaledCellSize,
      pindouPaddingCells,
      gridWidth,
      gridHeight,
      flipHorizontal,
    );
  const resolveCropCellIndex = (clientX: number, clientY: number) =>
    resolveStageCellIndexFromClientPoint(
      clientX,
      clientY,
      stageSurfaceRef.current,
      leftGutter,
      topGutter,
      scaledStageWidth,
      scaledStageHeight,
      stagePitch,
      scaledCellSize,
      pindouPaddingCells,
      gridWidth,
      gridHeight,
      flipHorizontal,
      {
        snapToGrid: true,
        clampToBounds: true,
      },
    );

  useEffect(() => {
    if ((stageMode !== "pindou" && stageMode !== "edit") || !stageViewportRef.current) {
      return;
    }

    const element = stageViewportRef.current;

    function getTouchDistance(touches: TouchList) {
      if (touches.length < 2) {
        return null;
      }
      const first = touches[0];
      const second = touches[1];
      return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
    }

    function clearTouchPan() {
      touchPanStateRef.current = null;
      setIsPanning(false);
    }

    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length === 1) {
        pinchStateRef.current = null;
        if (!canPanStage || (stageMode === "edit" && !effectivePanActive)) {
          clearTouchPan();
          return;
        }

        const touch = event.touches[0];
        touchPanStateRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          startPanX: panOffsetRef.current.x,
          startPanY: panOffsetRef.current.y,
          moved: false,
          cellIndex: resolveCellIndex(touch.clientX, touch.clientY),
        };
        return;
      }

      clearTouchPan();
      panStateRef.current = null;
      setIsPanning(false);
      const distance = getTouchDistance(event.touches);
      if (!distance) {
        return;
      }
      pinchStateRef.current = {
        distance,
        zoom: stageMode === "pindou" ? pindouZoom : editZoom,
      };
    }

    function handleTouchMove(event: TouchEvent) {
      if (event.touches.length === 1 && touchPanStateRef.current) {
        const touch = event.touches[0];
        const state = touchPanStateRef.current;
        const deltaX = touch.clientX - state.startX;
        const deltaY = touch.clientY - state.startY;
        if (!state.moved && Math.hypot(deltaX, deltaY) < 4) {
          return;
        }

        if (!state.moved) {
          state.moved = true;
          setIsPanning(true);
        }

        event.preventDefault();
        setPanOffset(
          clampStagePanOffset(
            { x: state.startPanX + deltaX, y: state.startPanY + deltaY },
            panLimits,
          ),
        );
        return;
      }

      if (event.touches.length < 2 || !pinchStateRef.current) {
        return;
      }

      const distance = getTouchDistance(event.touches);
      if (!distance) {
        return;
      }

      event.preventDefault();
      const nextZoom = (pinchStateRef.current.zoom * distance) / pinchStateRef.current.distance;
      if (stageMode === "pindou") {
        onPindouZoomChange?.(clampPindouZoom(nextZoom));
      } else {
        onEditZoomChange?.(clampEditorZoom(nextZoom));
      }
    }

    function handleTouchEnd(event: TouchEvent) {
      const touchPanState = touchPanStateRef.current;
      if (touchPanState && event.touches.length === 0) {
        if (
          stageMode === "pindou" &&
          !touchPanState.moved &&
          suppressTapUntilRef.current <= performance.now()
        ) {
          onPindouStageTap?.();
          const cell =
            touchPanState.cellIndex === null ? null : cells[touchPanState.cellIndex] ?? null;
          onFocusLabelChange?.(cell?.label && cell.label === focusedLabel ? null : cell?.label ?? null);
        }

        if (touchPanState.moved) {
          suppressTapUntilRef.current = performance.now() + 180;
        }

        clearTouchPan();
      }

      if (event.touches.length < 2) {
        pinchStateRef.current = null;
      }
    }

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", handleTouchEnd);
    element.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchEnd);
      clearTouchPan();
    };
  }, [stageMode, canPanStage, effectivePanActive, pindouZoom, onPindouZoomChange, editZoom, onEditZoomChange, cells, focusedLabel, onFocusLabelChange, onPindouStageTap, panLimits, leftGutter, topGutter, scaledStageWidth, scaledStageHeight, stagePitch, scaledCellSize, gridWidth, gridHeight, flipHorizontal]);

  useEffect(() => {
    if ((stageMode !== "pindou" && stageMode !== "edit") || !stageViewportRef.current) {
      return;
    }

    const element = stageViewportRef.current;

    function handleWheel(event: WheelEvent) {
      if (stageMode === "edit") {
        if (!onEditZoomChange) {
          return;
        }

        event.preventDefault();
        onEditZoomChange(clampEditorZoom(editZoom + (event.deltaY < 0 ? 0.12 : -0.12)));
        return;
      }

      if (!onPindouZoomChange) {
        return;
      }

      event.preventDefault();
      onPindouZoomChange(clampPindouZoom(pindouZoom + (event.deltaY < 0 ? 0.12 : -0.12)));
    }

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [stageMode, pindouZoom, onPindouZoomChange, editZoom, onEditZoomChange]);

  useEffect(() => {
    if (!canPanStage || !stageViewportRef.current) {
      setIsPanning(false);
      panStateRef.current = null;
      return;
    }

    const element = stageViewportRef.current;

    function clearPan(pointerId?: number) {
      if (pointerId !== undefined && element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
      panStateRef.current = null;
      setIsPanning(false);
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      if (stageMode === "edit" && !effectivePanActive) {
        return;
      }

      panStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startPanX: panOffsetRef.current.x,
        startPanY: panOffsetRef.current.y,
        moved: false,
        cellIndex: resolveCellIndex(event.clientX, event.clientY),
      };
      element.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event: PointerEvent) {
      const state = panStateRef.current;
      if (!state || state.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - state.startX;
      const deltaY = event.clientY - state.startY;
      if (!state.moved && Math.hypot(deltaX, deltaY) < 4) {
        return;
      }

      if (!state.moved) {
        state.moved = true;
        setIsPanning(true);
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      setPanOffset(
        clampStagePanOffset(
          { x: state.startPanX + deltaX, y: state.startPanY + deltaY },
          panLimits,
        ),
      );
    }

    function handlePointerEnd(event: PointerEvent) {
      const state = panStateRef.current;
      if (!state || state.pointerId !== event.pointerId) {
        return;
      }

      if (
        stageMode === "pindou" &&
        !state.moved &&
        suppressTapUntilRef.current <= performance.now()
      ) {
        onPindouStageTap?.();
        const cell = state.cellIndex === null ? null : cells[state.cellIndex] ?? null;
        onFocusLabelChange?.(cell?.label && cell.label === focusedLabel ? null : cell?.label ?? null);
      }

      if (state.moved) {
        suppressTapUntilRef.current = performance.now() + 180;
      }

      clearPan(event.pointerId);
    }

    element.addEventListener("pointerdown", handlePointerDown);
    element.addEventListener("pointermove", handlePointerMove);
    element.addEventListener("pointerup", handlePointerEnd);
    element.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      element.removeEventListener("pointerdown", handlePointerDown);
      element.removeEventListener("pointermove", handlePointerMove);
      element.removeEventListener("pointerup", handlePointerEnd);
      element.removeEventListener("pointercancel", handlePointerEnd);
      clearPan();
    };
  }, [canPanStage, effectivePanActive, stageMode, cells, focusedLabel, onFocusLabelChange, onPindouStageTap, panLimits, leftGutter, topGutter, scaledStageWidth, scaledStageHeight, stagePitch, scaledCellSize, gridWidth, gridHeight, flipHorizontal]);

  useEffect(() => {
    const canvas = stageCanvasRef.current;
    if (!canvas) {
      return;
    }

    const width = Math.max(1, Math.round(totalStageWidth));
    const height = Math.max(1, Math.round(totalStageHeight));
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;

    const boardX = leftGutter;
    const boardY = topGutter;
    const boardWidth = scaledStageWidth;
    const boardHeight = scaledStageHeight;
    const contentOffsetX = boardX + pindouPaddingCells * stagePitch;
    const contentOffsetY = boardY + pindouPaddingCells * stagePitch;
    const contentWidth = gridWidth * scaledCellSize + Math.max(0, gridWidth - 1) * scaledGap;
    const contentHeight = gridHeight * scaledCellSize + Math.max(0, gridHeight - 1) * scaledGap;
    if (stageMode === "pindou") {
      drawPindouBoardPattern(
        context,
        boardX,
        boardY,
        displayGridWidth,
        displayGridHeight,
        stagePitch,
        scaledCellSize,
        scaledGap,
        pindouBoardTheme,
      );
    } else {
      context.fillStyle = isDark ? "#3a3128" : "#c9c4bc";
      context.fillRect(boardX, boardY, boardWidth, boardHeight);
    }

    context.save();
    context.beginPath();
    context.rect(boardX, boardY, boardWidth, boardHeight);
    context.clip();

    for (let displayRow = 0; displayRow < displayGridHeight; displayRow += 1) {
      for (let displayColumn = 0; displayColumn < displayGridWidth; displayColumn += 1) {
        const contentRow = displayRow - pindouPaddingCells;
        const contentDisplayColumn = displayColumn - pindouPaddingCells;
        const isPaddingCell =
          stageMode === "pindou" &&
          (contentDisplayColumn < 0 ||
            contentDisplayColumn >= gridWidth ||
            contentRow < 0 ||
            contentRow >= gridHeight);
        const sourceColumn =
          !isPaddingCell && flipHorizontal
            ? gridWidth - 1 - contentDisplayColumn
            : contentDisplayColumn;
        const cellIndex =
          isPaddingCell || sourceColumn < 0 || sourceColumn >= gridWidth || contentRow < 0 || contentRow >= gridHeight
            ? null
            : contentRow * gridWidth + sourceColumn;
        const cell = cellIndex === null ? { label: null, hex: null } : cells[cellIndex] ?? { label: null, hex: null };
        const x = boardX + displayColumn * stagePitch;
        const y = boardY + displayRow * stagePitch;
        const cellBackground = getStageCellBackgroundColor(cell, stageMode, focusedLabel, isDark);
        if (stageMode === "pindou") {
          drawPindouBead(
            context,
            x,
            y,
            scaledCellSize,
            cellBackground,
            isDark,
            pindouBeadShape,
            !cell.label,
          );
        } else {
          context.fillStyle = cellBackground;
          context.fillRect(x, y, scaledCellSize, scaledCellSize);
        }

        if (stageMode === "pindou" && !isPaddingCell && focusedLabel && cell.label === focusedLabel) {
          drawPindouBeadFocusRing(context, x, y, scaledCellSize, isDark, pindouBeadShape);
        }

        if (!shouldShowStageCellLabel(cell, stageMode, focusedLabel, showPindouLabels)) {
          continue;
        }

        const labelStyle = getStageCellLabelStyle(cell, stageMode, focusedLabel, isDark, scaledCellSize);
        context.font = `700 ${labelStyle.fontSize} system-ui, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.lineJoin = "round";
        context.lineWidth = Math.max(1, scaledCellSize * 0.1);
        context.strokeStyle = labelStyle.color.includes("255")
          ? "rgba(17,17,17,0.42)"
          : "rgba(255,255,255,0.35)";
        context.strokeText(cell.label ?? "", x + scaledCellSize / 2, y + scaledCellSize / 2);
        context.fillStyle = labelStyle.color;
        context.fillText(cell.label ?? "", x + scaledCellSize / 2, y + scaledCellSize / 2);
      }
    }

    if (overlayEnabled && overlayImage) {
      const sx = overlayCropRect ? overlayCropRect.x * overlayImage.width : 0;
      const sy = overlayCropRect ? overlayCropRect.y * overlayImage.height : 0;
      const sw = overlayCropRect ? overlayCropRect.width * overlayImage.width : overlayImage.width;
      const sh = overlayCropRect ? overlayCropRect.height * overlayImage.height : overlayImage.height;
      const destinationX = stageMode === "pindou" ? contentOffsetX : boardX;
      const destinationY = stageMode === "pindou" ? contentOffsetY : boardY;
      const destinationWidth = stageMode === "pindou" ? contentWidth : boardWidth;
      const destinationHeight = stageMode === "pindou" ? contentHeight : boardHeight;

      if (flipHorizontal) {
        context.save();
        context.translate(destinationX + destinationWidth, 0);
        context.scale(-1, 1);
        context.drawImage(
          overlayImage,
          sx,
          sy,
          sw,
          sh,
          0,
          destinationY,
          destinationWidth,
          destinationHeight,
        );
        context.restore();
      } else {
        context.drawImage(
          overlayImage,
          sx,
          sy,
          sw,
          sh,
          destinationX,
          destinationY,
          destinationWidth,
          destinationHeight,
        );
      }
    }

    if (stageMode === "pindou") {
      drawCanvasGuideLines(
        context,
        boardX,
        boardY,
        boardWidth,
        boardHeight,
        displayGridWidth,
        displayGridHeight,
        stagePitch,
        scaledGap,
      );
    }

    context.restore();

    if (stageMode === "pindou") {
      drawCanvasAxisLabels(
        context,
        boardX,
        boardY,
        displayGridWidth,
        displayGridHeight,
        stageScale,
        axisGutter,
        scaledStageWidth,
        scaledStageHeight,
      );
    }
  }, [cells, gridWidth, gridHeight, totalStageWidth, totalStageHeight, leftGutter, topGutter, scaledStageWidth, scaledStageHeight, scaledCellSize, scaledGap, stagePitch, stageScale, stageMode, focusedLabel, isDark, overlayEnabled, overlayImage, overlayCropRect, flipHorizontal, axisGutter, showPindouLabels, pindouBeadShape, pindouBoardTheme, pindouPaddingCells, displayGridWidth, displayGridHeight]);

  function updateHoveredState(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (showBrushCursor || showFillCursor || showPickCursor) {
      setCursorPreview({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        visible: true,
      });
    }
    setHoveredCellIndex(resolveCellIndex(event.clientX, event.clientY));
  }

  function applyCellAt(index: number | null) {
    if (index === null || !onApplyCell) {
      return;
    }
    if (lastAppliedCellIndexRef.current === index) {
      return;
    }
    lastAppliedCellIndexRef.current = index;
    onApplyCell(index, altPickActive && !spacePanActive ? "pick" : undefined);
  }

  return (
    <div
        ref={stageViewportRef}
        tabIndex={stageMode === "edit" ? 0 : undefined}
        className={clsx(
          "relative flex h-full w-full min-h-0 min-w-0 max-w-full flex-1 touch-none",
          embeddedInPanel
            ? stageMode === "pindou"
              ? "rounded-none border-0 p-1.5 sm:p-2"
            : "rounded-none border-0 p-2 sm:p-3"
          : "rounded-[10px] border p-2 sm:p-3",
        embeddedInPanel ? "mt-0" : focusOnly ? "mt-0" : "mt-4",
        "overflow-hidden",
        showBrushCursor || showFillCursor || showPickCursor ? "cursor-none" : "",
        cropToolActive && !spacePanActive ? "cursor-crosshair" : "",
        zoomToolActive && !spacePanActive ? "cursor-zoom-in" : "",
        canPanStage && (stageMode === "pindou" || effectivePanActive)
          ? isPanning
            ? "cursor-grabbing select-none"
            : stageMode === "pindou"
              ? "cursor-default"
              : "cursor-grab"
          : "",
        theme.previewStage,
        embeddedInPanel ? "" : isDark ? "border-white/14" : "border-stone-300",
        viewportClassName,
      )}
      onFocus={() => {
        if (stageMode === "edit") {
          onStageEngage?.();
        }
      }}
      onPointerEnter={(event) => {
        syncAltPickState(event.altKey);
        updateHoveredState(event);
      }}
      onPointerMove={(event) => {
        syncAltPickState(event.altKey);
        updateHoveredState(event);
        const cropPointerState = cropPointerStateRef.current;
        if (cropPointerState && cropPointerState.pointerId === event.pointerId) {
          const cropCellIndex = resolveCropCellIndex(event.clientX, event.clientY);
          if (cropCellIndex === null) {
            return;
          }
          if (event.cancelable) {
            event.preventDefault();
          }
          onCanvasCropSelectionChange?.(
            createCanvasCropRectFromCellIndices(
              cropPointerState.anchorCellIndex,
              cropCellIndex,
              gridWidth,
            ),
          );
          return;
        }
        if (stageMode !== "edit" || effectivePanActive || effectiveEditTool === "zoom") {
          return;
        }
        if (paintActiveRef.current && drawPointerIdRef.current === event.pointerId) {
          applyCellAt(resolveCellIndex(event.clientX, event.clientY));
        }
      }}
      onPointerDown={(event) => {
        syncAltPickState(event.altKey);
        if (stageMode === "edit") {
          event.currentTarget.focus();
          onStageEngage?.();
        }
        updateHoveredState(event);
        if (stageMode !== "edit") {
          return;
        }
        if (event.pointerType === "mouse" && event.button !== 0 && effectiveEditTool !== "zoom") {
          return;
        }

        if (effectiveEditTool === "zoom") {
          if (spacePanActive) {
            return;
          }
          onEditZoomChange?.(clampEditorZoom(editZoom + (event.button === 2 || event.shiftKey ? -0.2 : 0.2)));
          return;
        }
        if (cropToolActive) {
          const cropCellIndex = resolveCropCellIndex(event.clientX, event.clientY);
          if (effectivePanActive || cropCellIndex === null) {
            return;
          }
          if (event.currentTarget.setPointerCapture) {
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          cropPointerStateRef.current = {
            pointerId: event.pointerId,
            anchorCellIndex: cropCellIndex,
          };
          onCanvasCropSelectionChange?.(
            createCanvasCropRectFromCellIndices(cropCellIndex, cropCellIndex, gridWidth),
          );
          return;
        }
        const cellIndex = resolveCellIndex(event.clientX, event.clientY);
        if (effectivePanActive || cellIndex === null) {
          return;
        }
        if (event.currentTarget.setPointerCapture) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        drawPointerIdRef.current = event.pointerId;
        paintActiveRef.current = true;
        applyCellAt(cellIndex);
      }}
      onPointerUp={(event) => {
        syncAltPickState(event.altKey);
        if (cropPointerStateRef.current?.pointerId === event.pointerId) {
          cropPointerStateRef.current = null;
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }
        if (drawPointerIdRef.current === event.pointerId) {
          drawPointerIdRef.current = null;
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }
      }}
      onPointerCancel={(event) => {
        syncAltPickState(event.altKey);
        if (cropPointerStateRef.current?.pointerId === event.pointerId) {
          cropPointerStateRef.current = null;
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }
        if (drawPointerIdRef.current === event.pointerId) {
          drawPointerIdRef.current = null;
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }
      }}
      onContextMenu={(event) => {
        if (stageMode === "edit" && effectiveEditTool === "zoom") {
          event.preventDefault();
        }
      }}
      onPointerLeave={() => {
        setHoveredCellIndex(null);
        lastAppliedCellIndexRef.current = null;
        setCursorPreview((previous) => ({ ...previous, visible: false }));
      }}
      onBlur={() => {
        if (stageMode === "edit") {
          onStageDisengage?.();
        }
      }}
    >
      {showCanvasStatusBadge ? (
        <CanvasStatusBadge
          gridWidth={gridWidth}
          gridHeight={gridHeight}
          hoveredCellIndex={hoveredCellIndex}
          isDark={isDark}
        />
      ) : null}
      {busy ? <StageLoadingOverlay isDark={isDark} /> : null}
      {showBrushCursor && cursorPreview.visible ? (
        <div
          className="pointer-events-none absolute z-40 flex items-center justify-center"
          style={{
            left: `${cursorPreview.x}px`,
            top: `${cursorPreview.y}px`,
            width: `${brushPreviewSize}px`,
            height: `${brushPreviewSize}px`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div
            className="absolute inset-0 rounded-full shadow-sm"
            style={{
              border: effectiveEditTool === "erase" ? "2px dashed" : "2px solid",
              borderColor:
                effectiveEditTool === "erase"
                  ? isDark
                    ? "rgba(255,255,255,0.88)"
                    : "rgba(17,17,17,0.84)"
                  : selectedHex ?? (isDark ? "#F7F4EE" : "#111111"),
              backgroundColor:
                effectiveEditTool === "erase"
                  ? "transparent"
                  : selectedHex
                    ? `${selectedHex}12`
                    : isDark
                      ? "rgba(247,244,238,0.08)"
                      : "rgba(17,17,17,0.04)",
            }}
          />
          <div
            className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm"
            style={{
              backgroundColor: isDark ? "rgba(17,17,17,0.94)" : "rgba(255,255,255,0.98)",
              borderColor:
                effectiveEditTool === "erase"
                  ? isDark
                    ? "rgba(255,255,255,0.94)"
                    : "rgba(17,17,17,0.94)"
                  : selectedHex ?? (isDark ? "#F7F4EE" : "#111111"),
            }}
          />
        </div>
      ) : null}
      {showFillCursor && cursorPreview.visible ? (
        <div
          className="pointer-events-none absolute z-40"
          style={{
            left: `${cursorPreview.x}px`,
            top: `${cursorPreview.y}px`,
            transform: "translate(-18%, -88%)",
          }}
        >
          <PaintBucket
            className="h-5 w-5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]"
            style={{ color: selectedHex ?? (isDark ? "#F7F4EE" : "#111111") }}
          />
        </div>
      ) : null}
      {showPickCursor && cursorPreview.visible ? (
        <div
          className="pointer-events-none absolute z-40"
          style={{
            left: `${cursorPreview.x}px`,
            top: `${cursorPreview.y}px`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div className="relative h-10 w-10">
            <div
              className="absolute inset-0 rounded-full border-2 shadow-[0_0_0_1px_rgba(255,255,255,0.25)]"
              style={{
                borderColor: isDark ? "rgba(255,255,255,0.92)" : "rgba(17,17,17,0.92)",
                backgroundColor: isDark ? "rgba(24,24,27,0.18)" : "rgba(255,255,255,0.22)",
              }}
            />
            <div
              className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 rounded-full"
              style={{ backgroundColor: isDark ? "rgba(255,255,255,0.9)" : "rgba(17,17,17,0.88)" }}
            />
            <div
              className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 rounded-full"
              style={{ backgroundColor: isDark ? "rgba(255,255,255,0.9)" : "rgba(17,17,17,0.88)" }}
            />
            <div
              className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-[4px] border-2 shadow-sm"
              style={{
                backgroundColor: pickPreviewHex,
                borderColor: isDark ? "rgba(255,255,255,0.96)" : "rgba(17,17,17,0.9)",
              }}
            />
            <div
              className={clsx(
                "absolute top-1/2 z-10 flex min-w-[112px] max-w-[172px] -translate-y-1/2 items-center gap-2 rounded-md border px-2.5 py-1.5 shadow-md backdrop-blur-sm",
                isDark ? "border-white/12 bg-stone-950/92" : "border-stone-300 bg-white/95",
              )}
              style={{ left: "calc(100% + 14px)" }}
            >
              <div
                className="h-4 w-4 shrink-0 rounded-[4px] border"
                style={{
                  backgroundColor: pickPreviewHex,
                  borderColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(17,17,17,0.14)",
                }}
              />
              <div className="flex min-w-0 items-center gap-1.5">
                <Pipette className="h-3.5 w-3.5 shrink-0" style={{ color: pickPreviewTextColor }} />
                <span className="truncate text-xs font-semibold" style={{ color: pickPreviewTextColor }}>
                  {pickPreviewLabel}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex min-h-full min-w-full items-center justify-center">
        <div
          ref={stageSurfaceRef}
          className="relative w-fit shrink-0"
          style={{
            width: `${totalStageWidth}px`,
            height: `${totalStageHeight}px`,
            transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
          }}
        >
          <canvas ref={stageCanvasRef} className="block" />
          {canvasCropDisplayRect ? (
            <div className="pointer-events-none absolute inset-0 z-30">
              <div
                className="absolute"
                style={{
                  left: `${leftGutter}px`,
                  top: `${topGutter}px`,
                  width: `${scaledStageWidth}px`,
                  height: `${canvasCropDisplayRect.y - topGutter}px`,
                  backgroundColor: isDark ? "rgba(17,17,17,0.48)" : "rgba(17,17,17,0.16)",
                }}
              />
              <div
                className="absolute"
                style={{
                  left: `${leftGutter}px`,
                  top: `${canvasCropDisplayRect.y}px`,
                  width: `${canvasCropDisplayRect.x - leftGutter}px`,
                  height: `${canvasCropDisplayRect.height}px`,
                  backgroundColor: isDark ? "rgba(17,17,17,0.48)" : "rgba(17,17,17,0.16)",
                }}
              />
              <div
                className="absolute"
                style={{
                  left: `${canvasCropDisplayRect.x + canvasCropDisplayRect.width}px`,
                  top: `${canvasCropDisplayRect.y}px`,
                  width: `${leftGutter + scaledStageWidth - canvasCropDisplayRect.x - canvasCropDisplayRect.width}px`,
                  height: `${canvasCropDisplayRect.height}px`,
                  backgroundColor: isDark ? "rgba(17,17,17,0.48)" : "rgba(17,17,17,0.16)",
                }}
              />
              <div
                className="absolute"
                style={{
                  left: `${leftGutter}px`,
                  top: `${canvasCropDisplayRect.y + canvasCropDisplayRect.height}px`,
                  width: `${scaledStageWidth}px`,
                  height: `${topGutter + scaledStageHeight - canvasCropDisplayRect.y - canvasCropDisplayRect.height}px`,
                  backgroundColor: isDark ? "rgba(17,17,17,0.48)" : "rgba(17,17,17,0.16)",
                }}
              />
              <div
                className="absolute rounded-[6px] border-2 shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
                style={{
                  left: `${canvasCropDisplayRect.x}px`,
                  top: `${canvasCropDisplayRect.y}px`,
                  width: `${canvasCropDisplayRect.width}px`,
                  height: `${canvasCropDisplayRect.height}px`,
                  borderColor: isDark ? "rgba(255,215,120,0.96)" : "rgba(133,77,14,0.96)",
                  boxShadow: isDark
                    ? "inset 0 0 0 1px rgba(255,255,255,0.18)"
                    : "inset 0 0 0 1px rgba(255,255,255,0.42)",
                }}
              />
              <div
                className={clsx(
                  "absolute rounded-md px-2 py-1 text-[11px] font-semibold shadow-sm backdrop-blur-sm sm:text-xs",
                  isDark ? "bg-stone-950/88 text-amber-100" : "bg-white/92 text-stone-800",
                )}
                style={{
                  left: `${canvasCropDisplayRect.x + 8}px`,
                  top: `${Math.max(topGutter + 8, canvasCropDisplayRect.y + 8)}px`,
                }}
              >
                {canvasCropSelection?.width ?? 0} x {canvasCropSelection?.height ?? 0}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StageLoadingOverlay({ isDark }: { isDark: boolean }) {
  return (
    <div
      className={clsx(
        "absolute inset-0 z-50 flex items-center justify-center backdrop-blur-[2px]",
        isDark ? "bg-stone-950/42" : "bg-white/48",
      )}
    >
      <div
        className={clsx(
          "w-[min(240px,60%)] rounded-[10px] border px-4 py-4 shadow-sm",
          isDark ? "border-white/12 bg-stone-900/70" : "border-stone-200/90 bg-white/78",
        )}
      >
        <div
          className={clsx(
            "relative h-2 w-full overflow-hidden rounded-full",
            isDark ? "bg-stone-800/80" : "bg-stone-300/80",
          )}
        >
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
  );
}

function CanvasStatusBadge({
  gridWidth,
  gridHeight,
  hoveredCellIndex,
  isDark,
}: {
  gridWidth: number;
  gridHeight: number;
  hoveredCellIndex: number | null;
  isDark: boolean;
}) {
  const theme = getThemeClasses(isDark);
  const hoveredX = hoveredCellIndex === null ? "--" : String((hoveredCellIndex % gridWidth) + 1);
  const hoveredY = hoveredCellIndex === null ? "--" : String(Math.floor(hoveredCellIndex / gridWidth) + 1);

  return (
    <div
      className={clsx(
        "pointer-events-none absolute bottom-2 right-2 z-40 rounded-md px-2.5 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur-sm sm:text-xs",
        isDark ? "bg-stone-950/70 text-stone-100" : "bg-white/80 text-stone-700",
        theme.cardMuted,
      )}
    >
      {gridWidth} x {gridHeight} {hoveredX}, {hoveredY}
    </div>
  );
}

function resolveStageCellIndexFromClientPoint(
  clientX: number,
  clientY: number,
  stageSurface: HTMLDivElement | null,
  leftGutter: number,
  topGutter: number,
  scaledStageWidth: number,
  scaledStageHeight: number,
  stagePitch: number,
  scaledCellSize: number,
  pindouPaddingCells: number,
  gridWidth: number,
  gridHeight: number,
  flipHorizontal: boolean,
  options?: {
    snapToGrid?: boolean;
    clampToBounds?: boolean;
  },
) {
  if (!stageSurface) {
    return null;
  }

  const rect = stageSurface.getBoundingClientRect();
  const snapToGrid = options?.snapToGrid ?? false;
  const clampToBounds = options?.clampToBounds ?? false;
  const rawX = clientX - rect.left - leftGutter;
  const rawY = clientY - rect.top - topGutter;
  if (
    !snapToGrid &&
    (rawX < 0 || rawY < 0 || rawX >= scaledStageWidth || rawY >= scaledStageHeight)
  ) {
    return null;
  }

  const x = clampToBounds
    ? Math.max(0, Math.min(scaledStageWidth - 0.001, rawX))
    : rawX;
  const y = clampToBounds
    ? Math.max(0, Math.min(scaledStageHeight - 0.001, rawY))
    : rawY;
  if (x < 0 || y < 0 || x >= scaledStageWidth || y >= scaledStageHeight) {
    return null;
  }

  const minDisplayColumn = pindouPaddingCells;
  const maxDisplayColumn = pindouPaddingCells + gridWidth - 1;
  const minDisplayRow = pindouPaddingCells;
  const maxDisplayRow = pindouPaddingCells + gridHeight - 1;
  let displayColumn = Math.floor(x / stagePitch);
  let displayRow = Math.floor(y / stagePitch);
  if (snapToGrid) {
    displayColumn = Math.max(minDisplayColumn, Math.min(maxDisplayColumn, displayColumn));
    displayRow = Math.max(minDisplayRow, Math.min(maxDisplayRow, displayRow));
  } else {
    if (
      displayColumn < minDisplayColumn ||
      displayColumn > maxDisplayColumn ||
      displayRow < minDisplayRow ||
      displayRow > maxDisplayRow
    ) {
      return null;
    }

    const offsetX = x - displayColumn * stagePitch;
    const offsetY = y - displayRow * stagePitch;
    if (offsetX > scaledCellSize || offsetY > scaledCellSize) {
      return null;
    }
  }

  const row = displayRow - pindouPaddingCells;
  const contentColumn = displayColumn - pindouPaddingCells;
  const column = flipHorizontal ? gridWidth - 1 - contentColumn : contentColumn;
  return row * gridWidth + column;
}

function drawCanvasGuideLines(
  context: CanvasRenderingContext2D,
  boardX: number,
  boardY: number,
  boardWidth: number,
  boardHeight: number,
  gridWidth: number,
  gridHeight: number,
  stagePitch: number,
  scaledGap: number,
) {
  context.save();
  const majorLineWidth = 1.3;
  const minorLineWidth = 1.1;
  for (let index = 5; index < gridWidth; index += 5) {
    context.beginPath();
    const isMajorLine = index % 10 === 0;
    context.lineWidth = isMajorLine ? majorLineWidth : minorLineWidth;
    context.strokeStyle = isMajorLine ? "#000000" : "rgba(0, 0, 0, 0.5)";
    context.setLineDash(isMajorLine ? [] : [4, 6]);
    const x = boardX + index * stagePitch - scaledGap / 2;
    context.moveTo(x, boardY);
    context.lineTo(x, boardY + boardHeight);
    context.stroke();
  }
  for (let index = 5; index < gridHeight; index += 5) {
    context.beginPath();
    const isMajorLine = index % 10 === 0;
    context.lineWidth = isMajorLine ? majorLineWidth : minorLineWidth;
    context.strokeStyle = isMajorLine ? "#000000" : "rgba(0, 0, 0, 0.5)";
    context.setLineDash(isMajorLine ? [] : [4, 6]);
    const y = boardY + index * stagePitch - scaledGap / 2;
    context.moveTo(boardX, y);
    context.lineTo(boardX + boardWidth, y);
    context.stroke();
  }
  context.restore();
}

function drawCanvasAxisLabels(
  context: CanvasRenderingContext2D,
  boardX: number,
  boardY: number,
  gridWidth: number,
  gridHeight: number,
  stageScale: number,
  gutter: number,
  boardWidth: number,
  boardHeight: number,
) {
  const labelsX = buildAxisLabelPositions(gridWidth);
  const labelsY = buildAxisLabelPositions(gridHeight);
  const fontSize = Math.max(9, Math.min(12, 10 * stageScale + 1));
  context.save();
  context.font = `700 ${fontSize}px system-ui, sans-serif`;
  context.fillStyle = "rgba(17,17,17,0.78)";
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const label of labelsX) {
    const position = ((label.index + 0.5) / gridWidth) * boardWidth;
    context.fillText(String(label.value), boardX + position, boardY - gutter * 0.38);
  }

  for (const label of labelsY) {
    const position = ((label.index + 0.5) / gridHeight) * boardHeight;
    context.fillText(String(label.value), boardX - gutter * 0.38, boardY + position);
  }
  context.restore();
}

function drawPindouBoardPattern(
  context: CanvasRenderingContext2D,
  boardX: number,
  boardY: number,
  gridWidth: number,
  gridHeight: number,
  stagePitch: number,
  scaledCellSize: number,
  scaledGap: number,
  boardTheme: PindouBoardTheme,
) {
  const shades = getPindouBoardThemeShades(boardTheme);
  const pattern = [
    [0, 1, 1, 0],
    [1, 2, 2, 1],
    [1, 2, 2, 1],
    [0, 1, 1, 0],
  ] as const;
  const blockSpan = 5;
  const totalWidth = gridWidth > 0 ? gridWidth * stagePitch - scaledGap : scaledCellSize;
  const totalHeight = gridHeight > 0 ? gridHeight * stagePitch - scaledGap : scaledCellSize;

  context.fillStyle = shades[1];
  context.fillRect(boardX, boardY, totalWidth, totalHeight);

  for (let blockRow = 0; blockRow * blockSpan < gridHeight; blockRow += 1) {
    for (let blockColumn = 0; blockColumn * blockSpan < gridWidth; blockColumn += 1) {
      const startColumn = blockColumn * blockSpan;
      const startRow = blockRow * blockSpan;
      const endColumn = Math.min(gridWidth, startColumn + blockSpan);
      const endRow = Math.min(gridHeight, startRow + blockSpan);
      const x = boardX + startColumn * stagePitch;
      const y = boardY + startRow * stagePitch;
      const width = (endColumn - startColumn) * stagePitch - scaledGap;
      const height = (endRow - startRow) * stagePitch - scaledGap;
      const toneIndex = pattern[blockRow % 4][blockColumn % 4];

      context.fillStyle = shades[toneIndex];
      context.fillRect(x, y, width, height);
    }
  }
}

function drawPindouBead(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  fillColor: string,
  isDark: boolean,
  beadShape: PindouBeadShape,
  isEmpty: boolean,
) {
  context.save();
  if (isEmpty) {
    const radius = Math.max(0.9, size * 0.13);
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fillStyle = isDark ? "rgba(255,255,255,0.18)" : "rgba(17,17,17,0.14)";
    context.fill();
    context.lineWidth = Math.max(0.6, size * 0.025);
    context.strokeStyle = isDark ? "rgba(255,255,255,0.24)" : "rgba(17,17,17,0.18)";
    context.stroke();
    context.restore();
    return;
  }

  context.fillStyle = fillColor;
  context.lineWidth = Math.max(0.8, size * 0.04);
  context.strokeStyle = isDark ? "rgba(255,255,255,0.12)" : "rgba(17,17,17,0.08)";

  if (beadShape === "circle") {
    const inset = Math.max(0.04, size * 0.007);
    const radius = Math.max(1, (size - inset * 2) / 2);
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  } else {
    const inset = Math.max(0.24, size * 0.022);
    const length = Math.max(1, size - inset * 2);
    context.fillRect(x + inset, y + inset, length, length);
    context.strokeRect(x + inset, y + inset, length, length);
  }

  context.restore();
}

function drawPindouBeadFocusRing(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  isDark: boolean,
  beadShape: PindouBeadShape,
) {
  context.save();
  context.lineWidth = Math.max(1.5, size * 0.08);
  context.strokeStyle = isDark ? "rgba(255,255,255,0.92)" : "rgba(17,17,17,0.84)";

  if (beadShape === "circle") {
    const inset = Math.max(0.2, size * 0.018);
    const radius = Math.max(1, (size - inset * 2) / 2);
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
  } else {
    const inset = Math.max(0.3, size * 0.02);
    const length = Math.max(1, size - inset * 2);
    context.strokeRect(x + inset, y + inset, length, length);
  }

  context.restore();
}

function calculateStageCellSize(
  gridWidth: number,
  gridHeight: number,
  availableWidth: number,
  availableHeight: number,
) {
  if (gridWidth <= 0 || gridHeight <= 0) {
    return 12;
  }

  const widthBound = availableWidth > 0 ? Math.floor(availableWidth / gridWidth) : 26;
  const heightBound = availableHeight > 0 ? Math.floor(availableHeight / gridHeight) : 26;
  return Math.max(4, Math.min(26, Math.min(widthBound, heightBound) || 26));
}

function calculateStageScale(
  stageWidth: number,
  stageHeight: number,
  availableWidth: number,
  availableHeight: number,
) {
  if (stageWidth <= 0 || stageHeight <= 0) {
    return 1;
  }

  const widthScale = availableWidth > 0 ? availableWidth / stageWidth : 1;
  const heightScale = availableHeight > 0 ? availableHeight / stageHeight : 1;
  return Math.max(0.1, Math.min(1, widthScale, heightScale));
}

function calculateStagePanLimits(
  stageWidth: number,
  stageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  return {
    maxX: Math.max(0, Math.abs(stageWidth - viewportWidth) / 2 + Math.min(64, Math.max(24, viewportWidth * 0.08))),
    maxY: Math.max(0, Math.abs(stageHeight - viewportHeight) / 2 + Math.min(64, Math.max(24, viewportHeight * 0.08))),
  };
}

function clampStagePanOffset(offset: { x: number; y: number }, limits: { maxX: number; maxY: number }) {
  return {
    x: Math.max(-limits.maxX, Math.min(limits.maxX, offset.x)),
    y: Math.max(-limits.maxY, Math.min(limits.maxY, offset.y)),
  };
}

export function clampPindouZoom(value: number) {
  return Math.max(0.5, Math.min(4, Number(value.toFixed(2))));
}

export function clampEditorZoom(value: number) {
  return Math.max(0.5, Math.min(6, Number(value.toFixed(2))));
}

function getStageCellBackgroundColor(
  cell: EditableCell,
  stageMode: EditorPanelMode,
  focusedLabel: string | null | undefined,
  isDark: boolean,
) {
  const emptyColor = isDark ? "rgba(29,20,16,0.55)" : "rgba(247,244,238,0.65)";
  if (stageMode !== "pindou" || !focusedLabel) {
    return cell.hex ?? emptyColor;
  }

  if (cell.label === focusedLabel && cell.hex) {
    return cell.hex;
  }

  if (cell.hex) {
    return blendHexWithWhite(cell.hex, 0.92);
  }

  return isDark ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.96)";
}

function shouldShowStageCellLabel(
  cell: EditableCell,
  stageMode: EditorPanelMode,
  focusedLabel: string | null | undefined,
  showPindouLabels: boolean,
) {
  if (stageMode === "edit" || !cell.label || !showPindouLabels) {
    return false;
  }

  return !focusedLabel || cell.label === focusedLabel;
}

function getStageCellLabelStyle(
  cell: EditableCell,
  stageMode: EditorPanelMode,
  focusedLabel: string | null | undefined,
  isDark: boolean,
  cellSize: number,
) {
  const background = getStageCellBackgroundColor(cell, stageMode, focusedLabel, isDark);
  const useLightText = shouldUseLightText(background);
  const fontSize = Math.max(5, Math.min(10, Math.round(cellSize * 0.22)));
  return {
    color: useLightText ? "rgba(255,255,255,0.96)" : "rgba(17,17,17,0.92)",
    fontSize: `${fontSize}px`,
  };
}

function buildAxisLabelPositions(gridCount: number) {
  const labels: Array<{ index: number; value: number }> = [];
  for (let index = 0; index < gridCount; index += 1) {
    const value = index + 1;
    if (value === 1 || value % 5 === 0 || value === gridCount) {
      labels.push({ index, value });
    }
  }
  return labels;
}

function blendHexWithWhite(hex: string, ratio: number) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return hex;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const mix = (value: number) => Math.round(value + (255 - value) * ratio);
  return `rgb(${mix(red)}, ${mix(green)}, ${mix(blue)})`;
}

function chooseCursorTextColor(hex: string) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return "#111111";
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 >= 160 ? "#111111" : "#FFFFFF";
}

function shouldUseLightText(color: string) {
  const rgb = parseCssColor(color);
  if (!rgb) {
    return false;
  }

  const [red, green, blue] = rgb;
  const luminance =
    toLinearChannel(red / 255) * 0.2126 +
    toLinearChannel(green / 255) * 0.7152 +
    toLinearChannel(blue / 255) * 0.0722;
  return luminance < 0.42;
}

function parseCssColor(color: string): [number, number, number] | null {
  const normalized = color.trim();
  if (normalized.startsWith("#")) {
    const hex = normalized.slice(1);
    if (hex.length !== 6) {
      return null;
    }
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }

  const rgbMatch = normalized.match(/rgba?\(([^)]+)\)/i);
  if (!rgbMatch) {
    return null;
  }

  const parts = rgbMatch[1].split(",").slice(0, 3).map((part) => Number.parseFloat(part.trim()));
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return [parts[0], parts[1], parts[2]];
}

function toLinearChannel(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function isTypingElement(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  if (!element) {
    return false;
  }

  return (
    element.closest("input, textarea, [contenteditable='true'], [role='textbox']") !== null
  );
}

