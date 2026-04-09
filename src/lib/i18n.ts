export type Locale = "zh-CN" | "en-US";

export interface Messages {
  appBadge: string;
  appTitle: string;
  appDescription: string;
  languageLabel: string;
  languageChinese: string;
  languageEnglish: string;
  themeLabel: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
  sourceTitle: string;
  sourceLandingTitle: string;
  sourceSubtitle: string;
  sourcePrivacyNote: string;
  sourceLocalOnly: string;
  sourceChooseImage: string;
  sourceStayInTab: string;
  sourceFocusView: string;
  sourceExitFocus: string;
  sourceChartBadge: string;
  sourcePixelArtBadge: string;
  sourceImageBadge: string;
  gridTitle: string;
  gridSubtitle: string;
  colorSystemTitle: string;
  colorSystemSubtitle: string;
  gridAuto: string;
  gridManual: string;
  gridAutoDescription: string;
  gridFollowRatio: string;
  gridFollowRatioDescription: string;
  cropTitle: string;
  cropHint: string;
  cropReset: string;
  cropEdit: string;
  gridWidth: string;
  gridHeight: string;
  polishTitle: string;
  reduceColorsTitle: string;
  reduceColorsDescription: string;
  tolerance: string;
  preSharpenTitle: string;
  preSharpenDescription: string;
  strength: string;
  generateChart: string;
  processing: string;
  originalTitle: string;
  noImageSelected: string;
  sourceEmpty: string;
  previewTitle: string;
  noOutputYet: string;
  previewEmpty: string;
  resultTitle: string;
  resultSubtitle: string;
  downloadPng: string;
  editorTitle: string;
  editorSubtitle: string;
  editorTabEdit: string;
  editorTabPindou: string;
  pindouModeHint: string;
  pindouFlipHorizontal?: string;
  pindouBeadShapeLabel?: string;
  pindouBeadShapeSquare?: string;
  pindouBeadShapeCircle?: string;
  pindouBoardThemeLabel?: string;
  pindouBoardThemeNone?: string;
  pindouBoardThemeGray?: string;
  pindouBoardThemeGreen?: string;
  pindouBoardThemePink?: string;
  pindouBoardThemeBlue?: string;
  pindouShowLabels?: string;
  pindouTimerStart?: string;
  pindouTimerPause?: string;
  pindouTimerReset?: string;
  pindouFocusView: string;
  pindouExitFocus: string;
  toolLabel: string;
  toolPaint: string;
  toolErase: string;
  toolPick: string;
  toolFill: string;
  toolPan?: string;
  toolZoom?: string;
  toolUndo: string;
  toolRedo: string;
  selectedColor: string;
  emptyPixel: string;
  paletteTitle: string;
  paletteHint: string;
  paletteFilterPlaceholder: string;
  pixelEditorHint: string;
  overlayToggle: string;
  overlayOpacity: string;
  brushSize: string;
  fillThreshold: string;
  zoomLabel?: string;
  editorStage: string;
  modeLabel: string;
  gridLabel: string;
  logicalColorsLabel: string;
  paletteColorsUsedLabel: string;
  matchedColorsTitle: string;
  matchedColorsHint: string;
  similarColorsLabel?: (label: string) => string;
  labelsCount: (count: number) => string;
  readyHint: string;
  manualGridValidation: string;
  processingFailed: string;
  errorNonPixelArt: string;
  errorAutoGridAspectMismatch: string;
  errorAutoGridTooSmall: string;
  errorManualGridRequired: string;
  errorCanvasContextUnavailable: string;
  errorEncodingFailed: string;
  chartTitle: (width: number, height: number) => string;
  chartMetaLine: (colorSystemLabel: string, totalBeads: number) => string;
  detectionMode: Record<string, string>;
}

export const defaultLocale: Locale = "zh-CN";

export const messages: Record<Locale, Messages> = {
  "zh-CN": {
    appBadge: "图纸转换",
    appTitle: "拼豆图纸转换",
    appDescription: "上传图片，自动判格、降色、匹配所选色系，并生成带色号的成品图纸。",
    languageLabel: "语言",
    languageChinese: "中文",
    languageEnglish: "English",
    themeLabel: "主题",
    themeLight: "浅色",
    themeDark: "深色",
    themeSystem: "跟随系统",
    sourceTitle: "原图",
    sourceLandingTitle: "导入图片，或导入现有图纸",
    sourceSubtitle: "",
    sourcePrivacyNote: "全部处理都在浏览器内完成，不会上传到服务器。",
    sourceLocalOnly: "本地图片",
    sourceChooseImage: "选择图片",
    sourceStayInTab: "",
    sourceFocusView: "放大原图",
    sourceExitFocus: "关闭放大原图",
    sourceChartBadge: "图纸",
    sourcePixelArtBadge: "像素图",
    sourceImageBadge: "图片",
    gridTitle: "网格策略",
    gridSubtitle: "自动识别像素画，或手动指定网格后先像素化。",
    colorSystemTitle: "色系",
    colorSystemSubtitle: "选择要匹配的拼豆色系。",
    gridAuto: "自动识别",
    gridManual: "手动网格",
    gridAutoDescription: "可识别原始像素画、带分隔线的放大图，以及格子之间存在缝隙的像素图。识别失败时请改用手动模式。",
    gridFollowRatio: "跟随图片比例",
    gridFollowRatioDescription: "手动输入宽或高时，另一边会按当前图片或裁切区域比例自动计算。",
    cropTitle: "裁切",
    cropHint: "开启裁切后，可在预览图上拖拽选择区域，处理时只使用该区域。",
    cropReset: "重置裁切",
    cropEdit: "裁切模式",
    gridWidth: "网格宽度",
    gridHeight: "网格高度",
    polishTitle: "图像整理",
    reduceColorsTitle: "归并近似颜色",
    reduceColorsDescription: "在调色板匹配之前，先合并人眼不易区分的逻辑颜色。",
    tolerance: "容差",
    preSharpenTitle: "预锐化",
    preSharpenDescription: "只在普通图片转像素图时生效，用来减少糊边和晕边。",
    strength: "强度",
    generateChart: "图纸已更新",
    processing: "处理中...",
    originalTitle: "原始预览",
    noImageSelected: "尚未选择图片",
    sourceEmpty: "先选择一张源图片。",
    previewTitle: "图纸预览",
    noOutputYet: "尚未生成结果",
    previewEmpty: "生成完成后，这里会显示图纸预览。",
    resultTitle: "结果",
    resultSubtitle: "浅灰分隔线，黑色外框，底部颜色统计。",
    downloadPng: "保存图纸",
    editorTitle: "像素编辑",
    editorSubtitle: "点击格子可改色，或删除、补上任意像素。",
    editorTabEdit: "像素编辑",
    editorTabPindou: "拼豆模式",
    pindouModeHint: "点击颜色或图纸格子，可单独高亮一种颜色。",
    pindouFlipHorizontal: "水平翻转",
    pindouBeadShapeLabel: "豆子形状",
    pindouBeadShapeSquare: "方块",
    pindouBeadShapeCircle: "圆圈",
    pindouBoardThemeLabel: "底纹",
    pindouBoardThemeNone: "无底纹",
    pindouBoardThemeGray: "灰色系",
    pindouBoardThemeGreen: "绿色系",
    pindouBoardThemePink: "粉色系",
    pindouBoardThemeBlue: "蓝色系",
    pindouFocusView: "专注查看图纸",
    pindouExitFocus: "退出专注查看",
    toolLabel: "工具",
    toolPaint: "画笔",
    toolErase: "橡皮",
    toolPick: "吸管",
    toolFill: "填充",
    toolUndo: "撤销",
    toolRedo: "重做",
    selectedColor: "当前颜色",
    emptyPixel: "空像素",
    paletteTitle: "调色板",
    paletteHint: "",
    paletteFilterPlaceholder: "输入色号筛选",
    pixelEditorHint: "支持点击和拖动连续修改。",
    overlayToggle: "原图叠加",
    overlayOpacity: "叠加透明度",
    brushSize: "画笔粗细",
    fillThreshold: "填充容差",
    editorStage: "编辑画布",
    modeLabel: "模式",
    gridLabel: "网格",
    logicalColorsLabel: "逻辑颜色数",
    paletteColorsUsedLabel: "使用的调色板颜色",
    matchedColorsTitle: "匹配到的颜色",
    matchedColorsHint: "点击颜色可禁用或恢复",
    labelsCount: (count) => `${count} 个色号`,
    readyHint: "上传图片后，结果会显示在这里。",
    manualGridValidation: "手动模式下必须填写大于 0 的网格宽度和网格高度。",
    processingFailed: "转换失败。",
    errorNonPixelArt: "这张图不像是可直接识别的网格像素画。请切换到手动网格并先填写宽度和高度。",
    errorAutoGridAspectMismatch: "自动识别出的网格长宽比和输入图差异过大，已默认切换到手动网格。你仍然可以手动切回自动识别。",
    errorAutoGridTooSmall: "自动识别出的网格尺寸过小，结果很可能不对，已默认切换到手动网格。你可以在已识别区域基础上继续微调。",
    errorManualGridRequired: "手动模式下必须同时填写网格宽度和网格高度。",
    errorCanvasContextUnavailable: "当前环境无法使用 Canvas 2D 上下文。",
    errorEncodingFailed: "输出 PNG 编码失败。",
    chartTitle: (width, height) => `拼豆图纸 - ${width} x ${height}`,
    chartMetaLine: (colorSystemLabel, totalBeads) => `${colorSystemLabel} · ${totalBeads} 颗豆豆`,
    detectionMode: {
      "raw-pixel-art": "原始像素画",
      "detected-gridlines": "检测到分隔线网格",
      "detected-blocks": "检测到连续色块网格",
      "detected-gapped-grid": "检测到带缝隙网格",
      "converted-from-image": "普通图片转像素图",
    },
  },
  "en-US": {
    appBadge: "Chart Converter",
    appTitle: "Bead Chart Converter",
    appDescription: "Upload an image, detect or build the grid, match it to the selected color system, and render a labeled chart.",
    languageLabel: "Language",
    languageChinese: "中文",
    languageEnglish: "English",
    themeLabel: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    sourceTitle: "Source Image",
    sourceLandingTitle: "Import an image or an existing chart",
    sourceSubtitle: "",
    sourcePrivacyNote: "Everything is processed in the browser and is not uploaded to a server.",
    sourceLocalOnly: "Local image",
    sourceChooseImage: "Import image",
    sourceStayInTab: "",
    sourceFocusView: "????",
    sourceExitFocus: "??????",
    sourceChartBadge: "Chart",
    sourcePixelArtBadge: "Pixel Art",
    sourceImageBadge: "Image",
    gridTitle: "Grid Strategy",
    gridSubtitle: "Auto-detect pixel art, or provide a manual grid and pixelate first.",
    colorSystemTitle: "Color System",
    colorSystemSubtitle: "Choose the bead color system used for matching.",
    gridAuto: "Auto Detect",
    gridManual: "Manual Grid",
    gridAutoDescription: "Detects raw pixel art, enlarged charts with separators, and pixel grids that have visible gaps between cells. Switch to manual mode if detection fails.",
    gridFollowRatio: "Follow Image Ratio",
    gridFollowRatioDescription: "When you edit width or height in manual mode, the other side follows the current image or crop aspect ratio.",
    cropTitle: "Crop",
    cropHint: "Enable crop mode, then drag on the preview image to choose the area used for processing.",
    cropReset: "Reset Crop",
    cropEdit: "Crop Mode",
    gridWidth: "Grid Width",
    gridHeight: "Grid Height",
    polishTitle: "Polish",
    reduceColorsTitle: "Reduce Colors",
    reduceColorsDescription: "Merge logical colors that are visually close before palette matching.",
    tolerance: "Tolerance",
    preSharpenTitle: "Pre-Sharpen",
    preSharpenDescription: "Used only when converting a normal image into pixel art to keep edges cleaner.",
    strength: "Strength",
    generateChart: "Chart Updated",
    processing: "Processing...",
    originalTitle: "Original",
    noImageSelected: "No image selected",
    sourceEmpty: "Choose a source image to start.",
    previewTitle: "Chart Preview",
    noOutputYet: "No output yet",
    previewEmpty: "The generated chart preview will appear here.",
    resultTitle: "Result",
    resultSubtitle: "Light gray separators, black frame, bottom legend.",
    downloadPng: "Save Chart",
    editorTitle: "Pixel Editor",
    editorSubtitle: "Click cells to recolor them, or remove and add any pixel.",
    editorTabEdit: "Pixel Edit",
    editorTabPindou: "Pindou Mode",
    pindouModeHint: "Click a color or a grid cell to highlight a single color.",
    pindouFlipHorizontal: "Flip Horizontally",
    pindouBeadShapeLabel: "Bead Shape",
    pindouBeadShapeSquare: "Square",
    pindouBeadShapeCircle: "Circle",
    pindouBoardThemeLabel: "Board Theme",
    pindouBoardThemeNone: "None",
    pindouBoardThemeGray: "Gray",
    pindouBoardThemeGreen: "Green",
    pindouBoardThemePink: "Pink",
    pindouBoardThemeBlue: "Blue",
    pindouFocusView: "Focus on sketch",
    pindouExitFocus: "Exit focus view",
    toolLabel: "Tool",
    toolPaint: "Paint",
    toolErase: "Erase",
    toolPick: "Pick",
    toolFill: "Fill",
    toolPan: "Pan",
    toolZoom: "Zoom",
    toolUndo: "Undo",
    toolRedo: "Redo",
    selectedColor: "Selected Color",
    emptyPixel: "Empty Pixel",
    paletteTitle: "Palette",
    paletteHint: "Pick a color first, then click cells on the grid.",
    paletteFilterPlaceholder: "Filter by color label",
    pixelEditorHint: "Click or drag to edit continuously.",
    overlayToggle: "Original Overlay",
    overlayOpacity: "Overlay Opacity",
    brushSize: "Brush Size",
    fillThreshold: "Fill Threshold",
    zoomLabel: "Zoom",
    editorStage: "Canvas",
    modeLabel: "Mode",
    gridLabel: "Grid",
    logicalColorsLabel: "Logical Colors",
    paletteColorsUsedLabel: "Palette Colors Used",
    matchedColorsTitle: "Matched Colors",
    matchedColorsHint: "Click a color to disable or restore it",
    similarColorsLabel: (label) => `Colors similar to ${label}`,
    labelsCount: (count) => `${count} colors`,
    readyHint: "Upload an image and the result will appear here.",
    manualGridValidation: "Manual mode requires positive grid width and grid height.",
    processingFailed: "Conversion failed.",
    errorNonPixelArt: "This image does not look like grid-based pixel art. Switch to Manual Grid and provide width and height first.",
    errorAutoGridAspectMismatch: "The auto-detected grid ratio differs too much from the input image, so the app switched to Manual Grid by default. You can still switch back to Auto Detect.",
    errorAutoGridTooSmall: "The auto-detected grid is too small to trust, so the app switched to Manual Grid by default. You can continue from the detected board area.",
    errorManualGridRequired: "Manual mode requires both grid width and grid height.",
    errorCanvasContextUnavailable: "Canvas 2D context is not available in this environment.",
    errorEncodingFailed: "Failed to encode the output PNG.",
    chartTitle: (width, height) => `Bead Chart - ${width} x ${height}`,
    chartMetaLine: (colorSystemLabel, totalBeads) => `${colorSystemLabel} · ${totalBeads} beads`,
    detectionMode: {
      "raw-pixel-art": "Raw pixel art",
      "detected-gridlines": "Detected gridline chart",
      "detected-blocks": "Detected block grid",
      "detected-gapped-grid": "Detected gapped grid",
      "converted-from-image": "Converted from image",
    },
  },
};

export function getMessages(locale: Locale) {
  return messages[locale];
}

