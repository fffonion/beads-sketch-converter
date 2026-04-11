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
  sourcePrivacyNote: string;
  sourceChartCodeTitle: string;
  sourceChartCodePlaceholder: string;
  sourceImportChartCode: string;
  sourceLocalOnly: string;
  sourceChooseImage: string;
  sourceDropHint: string;
  sourceDropActive: string;
  sourceFocusView: string;
  sourceExitFocus: string;
  sourceChartBadge: string;
  sourcePixelArtBadge: string;
  sourceImageBadge: string;
  gridTitle: string;
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
  editorTabEditLocked: string;
  editorTabPindou: string;
  editorTabChartSettings: string;
  editorTabChartLocked: string;
  chartSettingsChartTitle: string;
  chartSettingsChartTitlePlaceholder: string;
  chartSettingsPreview: string;
  chartSettingsPreviewEmpty: string;
  chartSettingsChartCode: string;
  chartSettingsChartCodePlaceholder: string;
  chartSettingsCopyChartLink: string;
  chartSettingsCopyChartLinkCopied: string;
  chartSettingsCopyChartCode: string;
  chartSettingsCopyChartCodeCopied: string;
  chartSettingsExportQrCode: string;
  chartSettingsWatermarkText: string;
  chartSettingsWatermarkImage: string;
  chartSettingsChooseWatermarkImage: string;
  chartSettingsClearWatermarkImage: string;
  chartSettingsNoWatermarkImage: string;
  chartSettingsSaveMetadata: string;
  chartSettingsSaveMetadataDescription: string;
  chartSettingsSaveMetadataLockedDescription: string;
  chartSettingsLockEditing: string;
  chartSettingsLockEditingDescription: string;
  chartSettingsIncludeGuides: string;
  chartSettingsIncludeGuidesDescription: string;
  chartSettingsIncludeBoardPattern: string;
  chartSettingsIncludeLegend: string;
  chartSettingsIncludeLegendDescription: string;
  chartSettingsIncludeQrCode: string;
  chartSettingsIncludeQrCodeDescription: string;
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
  errorChartLinkInvalid: string;
  errorChartSerializationTooManyColors: string;
  errorChartQrTooLarge: string;
  chartQrCaption: string;
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
    sourceLandingTitle: "导入图片，或者现有图纸。",
    sourcePrivacyNote: "全部处理都在浏览器内完成，不会上传到服务器。",
    sourceChartCodeTitle: "也可以导入图纸码",
    sourceChartCodePlaceholder: "",
    sourceImportChartCode: "导入图纸码",
    sourceLocalOnly: "本地图片",
    sourceChooseImage: "选择图片",
    sourceDropHint: "也支持把图片直接拖到这里。",
    sourceDropActive: "松开即可导入图片",
    sourceFocusView: "放大原图",
    sourceExitFocus: "关闭放大原图",
    sourceChartBadge: "图纸",
    sourcePixelArtBadge: "像素图",
    sourceImageBadge: "图片",
    gridTitle: "图片处理",
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
    downloadPng: "导出图纸",
    editorTitle: "像素编辑",
    editorSubtitle: "点击格子可改色，或删除、补上任意像素。",
    editorTabEdit: "画图图",
    editorTabEditLocked: "不许编辑",
    editorTabPindou: "拼豆豆",
    editorTabChartSettings: "导出出",
    editorTabChartLocked: "不许导出",
    chartSettingsChartTitle: "图纸标题",
    chartSettingsChartTitlePlaceholder: "拼豆图纸",
    chartSettingsPreview: "预览图",
    chartSettingsPreviewEmpty: "设置图纸后，这里会显示导出预览。",
    chartSettingsChartCode: "图纸码",
    chartSettingsChartCodePlaceholder: "",
    chartSettingsCopyChartLink: "复制链接",
    chartSettingsCopyChartLinkCopied: "链接已复制",
    chartSettingsCopyChartCode: "复制图纸码",
    chartSettingsCopyChartCodeCopied: "复制成功",
    chartSettingsExportQrCode: "导出二维码",
    chartSettingsWatermarkText: "水印文字",
    chartSettingsWatermarkImage: "水印图片",
    chartSettingsChooseWatermarkImage: "选择水印图片",
    chartSettingsClearWatermarkImage: "移除水印图片",
    chartSettingsNoWatermarkImage: "未选择水印图片",
    chartSettingsSaveMetadata: "保存元数据",
    chartSettingsSaveMetadataDescription: "开启后会把图纸数据写进 PNG，方便之后重新导入。",
    chartSettingsSaveMetadataLockedDescription: "已启用禁止编辑时，会强制把锁定位写进 PNG，导入后只能进入拼豆模式。",
    chartSettingsLockEditing: "禁止编辑",
    chartSettingsLockEditingDescription: "导入这张导出的图纸后，将无法编辑和重新导出，只能进入拼豆模式。",
    chartSettingsIncludeGuides: "添加参考线",
    chartSettingsIncludeGuidesDescription: "关闭后会同时隐藏 5/10 格参考线和坐标数字。",
    chartSettingsIncludeBoardPattern: "添加底纹",
    chartSettingsIncludeLegend: "添加色卡",
    chartSettingsIncludeLegendDescription: "控制图纸底部的颜色详情和数量统计。",
    chartSettingsIncludeQrCode: "添加二维码",
    chartSettingsIncludeQrCodeDescription: "导出图纸时附带可直接打开分享图纸的二维码。",
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
    pindouFocusView: "全屏模式",
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
    errorChartLinkInvalid: "链接里的图纸数据无效或不受支持。",
    errorChartSerializationTooManyColors: "这张图纸使用的颜色超过 256 种，无法保存为紧凑图纸数据。",
    errorChartQrTooLarge: "这张图纸太大，无法放进二维码。",
    chartQrCaption: "扫描二维码，进入超好用的拼豆模式",
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
    sourcePrivacyNote: "Everything is processed in the browser and is not uploaded to a server.",
    sourceChartCodeTitle: "Import Chart Code",
    sourceChartCodePlaceholder: "",
    sourceImportChartCode: "Import Chart Code",
    sourceLocalOnly: "Local image",
    sourceChooseImage: "Import image",
    sourceDropHint: "You can also drag an image here.",
    sourceDropActive: "Drop to import the image",
    sourceFocusView: "Expand image",
    sourceExitFocus: "Close expanded image",
    sourceChartBadge: "Chart",
    sourcePixelArtBadge: "Pixel Art",
    sourceImageBadge: "Image",
    gridTitle: "Grid Strategy",
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
    downloadPng: "Export Chart",
    editorTitle: "Pixel Editor",
    editorSubtitle: "Click cells to recolor them, or remove and add any pixel.",
    editorTabEdit: "Pixel Edit",
    editorTabEditLocked: "No Editing",
    editorTabPindou: "Pindou Mode",
    editorTabChartSettings: "Export Settings",
    editorTabChartLocked: "No Export",
    chartSettingsChartTitle: "Chart Title",
    chartSettingsChartTitlePlaceholder: "Bead Chart",
    chartSettingsPreview: "Preview",
    chartSettingsPreviewEmpty: "The exported chart preview appears here.",
    chartSettingsChartCode: "Chart Code",
    chartSettingsChartCodePlaceholder: "",
    chartSettingsCopyChartLink: "Copy Link",
    chartSettingsCopyChartLinkCopied: "Link Copied",
    chartSettingsCopyChartCode: "Copy Chart Code",
    chartSettingsCopyChartCodeCopied: "Copied",
    chartSettingsExportQrCode: "Export QR Code",
    chartSettingsWatermarkText: "Watermark Text",
    chartSettingsWatermarkImage: "Watermark Image",
    chartSettingsChooseWatermarkImage: "Choose Watermark Image",
    chartSettingsClearWatermarkImage: "Remove Watermark Image",
    chartSettingsNoWatermarkImage: "No watermark image selected",
    chartSettingsSaveMetadata: "Save Metadata",
    chartSettingsSaveMetadataDescription: "Embed chart data into the PNG so it can be imported directly later.",
    chartSettingsSaveMetadataLockedDescription:
      "When editing is locked, the PNG must keep embedded metadata so the lock bit survives import.",
    chartSettingsLockEditing: "Lock Editing",
    chartSettingsLockEditingDescription:
      "When this exported chart is imported later, it can only open in Pindou Mode and cannot be edited or exported again.",
    chartSettingsIncludeGuides: "Show Guides",
    chartSettingsIncludeGuidesDescription: "Turning this off also hides axis labels and 5/10-grid guide lines.",
    chartSettingsIncludeBoardPattern: "Show Board Pattern",
    chartSettingsIncludeLegend: "Show Legend",
    chartSettingsIncludeLegendDescription: "Controls the color list and counts at the bottom of the exported chart.",
    chartSettingsIncludeQrCode: "Show QR Code",
    chartSettingsIncludeQrCodeDescription: "Adds a QR code that opens the shared chart URL.",
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
    pindouFocusView: "Fullscreen mode",
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
    errorChartLinkInvalid: "The chart data in this link is invalid or unsupported.",
    errorChartSerializationTooManyColors:
      "This chart uses more than 256 colors, so it cannot be saved into the compact chart format.",
    errorChartQrTooLarge: "This chart is too large to fit in a QR code.",
    chartQrCaption: "Scan the QR code to open the super-handy Pindou Mode.",
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

