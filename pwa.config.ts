export const APP_PWA_NAME = "拼豆豆";
export const APP_PWA_DESCRIPTION = "拼豆图纸转换、编辑与导出工具";
export const APP_PWA_THEME_COLOR = "#f5e8d2";

export interface PwaManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

export interface PwaManifestDefinition {
  name: string;
  short_name: string;
  description: string;
  theme_color: string;
  background_color: string;
  display: "standalone";
  start_url: string;
  scope: string;
  icons: PwaManifestIcon[];
}

export interface PwaWorkboxDefinition {
  globPatterns: string[];
  navigateFallback: string;
  navigateFallbackAllowlist: RegExp[];
  cleanupOutdatedCaches: boolean;
  clientsClaim: boolean;
}

export function resolvePwaScope(basePath: string) {
  return basePath === "/" ? "/" : basePath;
}

export function buildPwaManifest(basePath: string): PwaManifestDefinition {
  const scope = resolvePwaScope(basePath);

  return {
    name: APP_PWA_NAME,
    short_name: APP_PWA_NAME,
    description: APP_PWA_DESCRIPTION,
    theme_color: APP_PWA_THEME_COLOR,
    background_color: APP_PWA_THEME_COLOR,
    display: "standalone",
    start_url: scope,
    scope,
    icons: [
      {
        src: `${scope}pwa-192x192.png`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: `${scope}pwa-512x512.png`,
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: `${scope}apple-touch-icon.png`,
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}

export function buildPwaWorkboxConfig(basePath: string): PwaWorkboxDefinition {
  const scope = resolvePwaScope(basePath);
  const escapedScope = scope.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const scopedNavigationPattern = `^${escapedScope}(?:index\\.html)?(?:\\?.*)?$`;

  return {
    globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"],
    navigateFallback: `${scope}index.html`,
    navigateFallbackAllowlist: [new RegExp(scopedNavigationPattern)],
    cleanupOutdatedCaches: true,
    clientsClaim: true,
  };
}
