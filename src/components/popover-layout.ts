export function getPopoverViewportLayout(input: {
  anchorRight: number;
  preferredWidth: number;
  viewportWidth: number;
  viewportMargin?: number;
}) {
  const viewportMargin = input.viewportMargin ?? 12;
  const width = Math.max(
    0,
    Math.min(input.preferredWidth, input.viewportWidth - viewportMargin * 2),
  );
  const maxLeft = Math.max(
    viewportMargin,
    input.viewportWidth - width - viewportMargin,
  );
  return {
    left: Math.min(
      Math.max(input.anchorRight - width, viewportMargin),
      maxLeft,
    ),
    width,
  };
}
