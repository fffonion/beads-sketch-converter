import { expect, test } from "bun:test";
import { basename } from "node:path";
import { debugAutoDetectRaster } from "../src/lib/mard";

const sampleImagePath =
  "D:\\fffonion\\Downloads\\拼豆图纸\\bangboo\\绝区零 邦布 拼豆图纸_4 (33 x 33).jpeg";
const exportedChartImagePath =
  "D:\\fffonion\\Downloads\\拼豆图纸\\bangboo\\绝区零 邦布 拼豆图纸 2_10 (38 x 39)_mard_chart_38x39.png";

function loadRasterWithPowerShell(imagePath: string) {
  const escapedPath = imagePath.replace(/'/g, "''");
  const command = `
Add-Type -AssemblyName System.Drawing
$path = '${escapedPath}'
$source = [System.Drawing.Bitmap]::FromFile($path)
try {
  $bitmap = New-Object System.Drawing.Bitmap($source.Width, $source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.DrawImage($source, 0, 0, $source.Width, $source.Height)
  } finally {
    $graphics.Dispose()
  }

  $rect = New-Object System.Drawing.Rectangle(0, 0, $bitmap.Width, $bitmap.Height)
  $data = $bitmap.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $length = [Math]::Abs($data.Stride) * $bitmap.Height
    $bytes = New-Object byte[] $length
    [Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $length)
    [Console]::Write((@{
      width = $bitmap.Width
      height = $bitmap.Height
      stride = [Math]::Abs($data.Stride)
      data = [Convert]::ToBase64String($bytes)
    } | ConvertTo-Json -Compress))
  } finally {
    $bitmap.UnlockBits($data)
    $bitmap.Dispose()
  }
} finally {
  $source.Dispose()
}`.trim();

  const result = Bun.spawnSync({
    cmd: ["powershell", "-NoProfile", "-Command", command],
    stdout: "pipe",
    stderr: "pipe",
  });

  if (result.exitCode !== 0) {
    throw new Error(Buffer.from(result.stderr).toString("utf8"));
  }

  const decoded = JSON.parse(Buffer.from(result.stdout).toString("utf8")) as {
    width: number;
    height: number;
    stride: number;
    data: string;
  };
  const bgra = Buffer.from(decoded.data, "base64");
  const rgba = new Uint8ClampedArray(decoded.width * decoded.height * 4);

  for (let y = 0; y < decoded.height; y += 1) {
    for (let x = 0; x < decoded.width; x += 1) {
      const sourceIndex = y * decoded.stride + x * 4;
      const targetIndex = (y * decoded.width + x) * 4;
      rgba[targetIndex] = bgra[sourceIndex + 2] ?? 0;
      rgba[targetIndex + 1] = bgra[sourceIndex + 1] ?? 0;
      rgba[targetIndex + 2] = bgra[sourceIndex] ?? 0;
      rgba[targetIndex + 3] = bgra[sourceIndex + 3] ?? 255;
    }
  }

  return {
    width: decoded.width,
    height: decoded.height,
    data: rgba,
  };
}

test("auto detect should not crop bangboo _4 into a stripe", () => {
  const raster = loadRasterWithPowerShell(sampleImagePath);
  const result = debugAutoDetectRaster(raster, basename(sampleImagePath));

  expect(result.cropBox).not.toBeNull();

  const [left, top, right, bottom] = result.cropBox!;
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  const aspect = cropWidth / cropHeight;

  expect(aspect).toBeGreaterThan(0.75);
  expect(aspect).toBeLessThan(1.25);
  expect(cropWidth).toBeGreaterThan(raster.width * 0.7);
  expect(cropHeight).toBeGreaterThan(raster.height * 0.7);
});

test("auto detect should crop exported chart to the framed pixel board", () => {
  const raster = loadRasterWithPowerShell(exportedChartImagePath);
  const result = debugAutoDetectRaster(raster, basename(exportedChartImagePath));

  expect(result.mode).toContain("chart-frame");
  expect(result.gridWidth).toBe(38);
  expect(result.gridHeight).toBe(39);
  expect(result.cropBox).not.toBeNull();

  const [left, top, right, bottom] = result.cropBox!;
  const cropWidth = right - left;
  const cropHeight = bottom - top;

  expect(left).toBeGreaterThan(0);
  expect(top).toBeGreaterThan(0);
  expect(cropWidth).toBeLessThan(raster.width);
  expect(cropHeight).toBeLessThan(raster.height);
  expect(cropHeight).toBeGreaterThan(raster.height * 0.45);
});
