import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { buildPwaManifest, buildPwaWorkboxConfig } from "./pwa.config";
export function normalizeBasePath(input) {
    if (!input) {
        return "./";
    }
    const trimmed = input.trim();
    if (!trimmed || trimmed === "/") {
        return "/";
    }
    return `/${trimmed.replace(/^\/+|\/+$/g, "")}/`;
}
export default defineConfig(({ command, mode }) => {
    const env = loadEnv(mode, ".", "");
    const basePath = command === "build" ? normalizeBasePath(env.PINDOU_BASE_PATH) : "/";
    return {
        plugins: [
            react(),
            tailwindcss(),
            VitePWA({
                registerType: "autoUpdate",
                injectRegister: false,
                includeAssets: [
                    "favicon.svg",
                    "apple-touch-icon.png",
                    "pwa-192x192.png",
                    "pwa-512x512.png",
                ],
                manifest: buildPwaManifest(basePath),
                workbox: buildPwaWorkboxConfig(basePath),
            }),
        ],
        base: basePath,
    };
});
