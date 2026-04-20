import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import viteConfig, { normalizeBasePath } from "../vite.config";
import {
  APP_PWA_NAME,
  buildPwaManifest,
  buildPwaWorkboxConfig,
  resolvePwaScope,
} from "../pwa.config";

const originalPindouBasePath = process.env.PINDOU_BASE_PATH;

function readCurrentPindouBasePath() {
  const value = process.env.PINDOU_BASE_PATH;
  return value && value !== "undefined" ? value : undefined;
}

test("normalizeBasePath should preserve root and normalize subpaths", () => {
  expect(normalizeBasePath(undefined)).toBe("./");
  expect(normalizeBasePath("/")).toBe("/");
  expect(normalizeBasePath("pdd")).toBe("/pdd/");
  expect(normalizeBasePath("/pdd/")).toBe("/pdd/");
});

test("buildPwaManifest should pin install metadata to the deployed base path", () => {
  expect(resolvePwaScope("/pdd/")).toBe("/pdd/");
  expect(buildPwaManifest("/pdd/")).toEqual(
    expect.objectContaining({
      name: APP_PWA_NAME,
      short_name: APP_PWA_NAME,
      display: "standalone",
      start_url: "/pdd/",
      scope: "/pdd/",
      theme_color: "#f5e8d2",
      background_color: "#f5e8d2",
    }),
  );
  expect(buildPwaManifest("/pdd/").icons).toEqual([
    expect.objectContaining({ src: "/pdd/pwa-192x192.png", sizes: "192x192" }),
    expect.objectContaining({ src: "/pdd/pwa-512x512.png", sizes: "512x512" }),
    expect.objectContaining({ src: "/pdd/apple-touch-icon.png", sizes: "180x180" }),
  ]);
});

test("buildPwaWorkboxConfig should include wasm and keep navigation fallback in scope", () => {
  expect(buildPwaWorkboxConfig("/pdd/")).toEqual(
    expect.objectContaining({
      navigateFallback: "/pdd/index.html",
      cleanupOutdatedCaches: true,
      clientsClaim: true,
    }),
  );
  expect(buildPwaWorkboxConfig("/pdd/").globPatterns).toContain(
    "**/*.{js,css,html,ico,png,svg,wasm}",
  );
  expect(buildPwaWorkboxConfig("/pdd/").navigateFallbackAllowlist).toHaveLength(1);
  expect(buildPwaWorkboxConfig("/pdd/").navigateFallbackAllowlist[0]?.test("/pdd/")).toBe(true);
  expect(buildPwaWorkboxConfig("/pdd/").navigateFallbackAllowlist[0]?.test("/pdd/index.html")).toBe(
    true,
  );
  expect(buildPwaWorkboxConfig("/pdd/").navigateFallbackAllowlist[0]?.test("/pdd/?c=demo")).toBe(
    true,
  );
  expect(
    buildPwaWorkboxConfig("/pdd/").navigateFallbackAllowlist[0]?.test("/pdd/index.html?c=demo"),
  ).toBe(true);
  expect(buildPwaWorkboxConfig("/pdd/").navigateFallbackAllowlist[0]?.test("/pdd/assets/app.js")).toBe(
    false,
  );
});

test("vite config should expose a manifest-backed PWA build for subpath deploys", async () => {
  process.env.PINDOU_BASE_PATH = "/pdd/";
  try {
    const resolved = await viteConfig({ command: "build", mode: "test" });
    const plugins = resolved.plugins ?? [];
    expect(plugins.length).toBeGreaterThan(2);
  } finally {
    if (originalPindouBasePath === undefined) {
      delete process.env.PINDOU_BASE_PATH;
    } else {
      process.env.PINDOU_BASE_PATH = originalPindouBasePath;
    }
  }
});

test("production build should emit manifest and service worker assets", () => {
  const distDir = join(process.cwd(), "dist");
  expect(existsSync(join(distDir, "manifest.webmanifest"))).toBe(true);
  expect(existsSync(join(distDir, "sw.js"))).toBe(true);

  const manifest = JSON.parse(readFileSync(join(distDir, "manifest.webmanifest"), "utf8"));
  expect(manifest.start_url).toBe(resolvePwaScope(normalizeBasePath(readCurrentPindouBasePath())));
});
