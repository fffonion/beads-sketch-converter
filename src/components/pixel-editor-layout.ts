export function shouldUseDesktopContentFitLayout(input: {
  viewportWidth: number;
  focusOnly?: boolean;
}) {
  return !input.focusOnly && input.viewportWidth >= 640;
}

export function getDesktopContentFitViewportScale(viewportWidth: number) {
  if (viewportWidth < 640) {
    return 1;
  }
  if (viewportWidth < 960) {
    return 0.9;
  }
  if (viewportWidth < 1280) {
    return 0.84;
  }
  return 0.78;
}
