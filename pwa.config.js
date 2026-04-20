export const APP_PWA_NAME = "拼豆豆";
export const APP_PWA_DESCRIPTION = "拼豆图纸转换、编辑与导出工具";
export const APP_PWA_THEME_COLOR = "#f5e8d2";
export function resolvePwaScope(basePath) {
    return basePath === "/" ? "/" : basePath;
}
export function buildPwaManifest(basePath) {
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
export function buildPwaWorkboxConfig(basePath) {
    const scope = resolvePwaScope(basePath);
    const escapedScope = scope.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"],
        navigateFallback: `${scope}index.html`,
        navigateFallbackAllowlist: [new RegExp(`^${escapedScope}(?:index\\.html)?$`)],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
    };
}
