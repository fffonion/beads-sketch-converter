export declare const APP_PWA_NAME = "\u62FC\u8C46\u8C46";
export declare const APP_PWA_DESCRIPTION = "\u62FC\u8C46\u56FE\u7EB8\u8F6C\u6362\u3001\u7F16\u8F91\u4E0E\u5BFC\u51FA\u5DE5\u5177";
export declare const APP_PWA_THEME_COLOR = "#f5e8d2";
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
export declare function resolvePwaScope(basePath: string): string;
export declare function buildPwaManifest(basePath: string): PwaManifestDefinition;
export declare function buildPwaWorkboxConfig(basePath: string): PwaWorkboxDefinition;
