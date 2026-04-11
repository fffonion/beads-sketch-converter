import brandWordmarkPng from "../assets/brand-wordmark.png";

export const BRAND_WORDMARK_TEXT = "\u62FC\u8C46\u8C46";
export const BRAND_WORDMARK_PNG_URL = brandWordmarkPng;

const VIEWBOX_WIDTH = 345;
const VIEWBOX_HEIGHT = 157;

let brandWordmarkImagePromise: Promise<HTMLImageElement> | null = null;

function loadBrandWordmarkImage() {
  if (!brandWordmarkImagePromise) {
    brandWordmarkImagePromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to load brand wordmark image."));
      image.src = BRAND_WORDMARK_PNG_URL;
    });
  }

  return brandWordmarkImagePromise;
}

export function measureBrandWordmarkWidth(height: number) {
  return (height * VIEWBOX_WIDTH) / VIEWBOX_HEIGHT;
}

export async function drawBrandWordmark(
  context: CanvasRenderingContext2D,
  x: number,
  centerY: number,
  height: number,
) {
  const image = await loadBrandWordmarkImage();
  const width = measureBrandWordmarkWidth(height);
  context.drawImage(image, x, centerY - height / 2, width, height);
}
