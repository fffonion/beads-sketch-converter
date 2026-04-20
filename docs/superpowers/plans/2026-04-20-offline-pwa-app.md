# Offline PWA App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app installable as a PWA and keep it fully bootable offline at `https://yooooo.us/pdd/` after the first online visit.

**Architecture:** Add base-aware PWA configuration at the Vite layer, isolate manifest and service worker registration decisions into small testable helpers, and provide installable icon assets in `public/`. Use `vite-plugin-pwa` with Workbox precaching so hashed Vite output, icons, and the detector WASM are cached without changing editor or processing behavior.

**Tech Stack:** Bun, Vite, React, TypeScript, vite-plugin-pwa, Workbox

---

## File Structure

- Modify: `package.json`
  Add the `vite-plugin-pwa` dependency.
- Modify: `vite.config.ts`
  Wire in `VitePWA`, keep `normalizeBasePath()` as the base-path source of truth, and use helper-built manifest and Workbox settings.
- Create: `src/lib/pwa.ts`
  Hold pure helpers for base-path normalization, manifest values, icon list, and Workbox include patterns so tests do not need to instantiate Vite.
- Create: `src/lib/pwa-register.ts`
  Hold a small browser-only registration helper that derives the service worker URL from `import.meta.env.BASE_URL`.
- Modify: `src/main.tsx`
  Register the service worker after bootstrapping React.
- Modify: `index.html`
  Add explicit theme-color and Apple touch icon metadata for install surfaces.
- Create: `tests/pwa.test.ts`
  Cover base-aware manifest settings, icon definitions, and service worker registration URL generation.
- Create: `tests/pwa-register.test.ts`
  Cover browser registration behavior and the no-op path when service workers are unavailable.
- Create: `public/pwa-192x192.png`
  Installable icon asset.
- Create: `public/pwa-512x512.png`
  Installable icon asset.
- Create: `public/apple-touch-icon.png`
  Installable touch icon asset if generated during the same icon pass.

### Task 1: Add pure PWA configuration helpers

**Files:**
- Create: `src/lib/pwa.ts`
- Test: `tests/pwa.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import {
  buildPwaManifest,
  buildPwaWorkboxConfig,
  resolvePwaScope,
} from "../src/lib/pwa";

test("buildPwaManifest should pin start_url and scope to the deployed base path", () => {
  expect(resolvePwaScope("/pdd/")).toBe("/pdd/");
  expect(buildPwaManifest("/pdd/")).toMatchObject({
    name: "拼豆豆",
    short_name: "拼豆豆",
    display: "standalone",
    start_url: "/pdd/",
    scope: "/pdd/",
  });
});

test("buildPwaWorkboxConfig should include wasm and keep navigation fallback in scope", () => {
  expect(buildPwaWorkboxConfig("/pdd/")).toMatchObject({
    navigateFallback: "/pdd/",
  });
  expect(buildPwaWorkboxConfig("/pdd/").globPatterns).toContain("**/*.{js,css,html,ico,png,svg,wasm}");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/pwa.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/pwa'` or missing export errors.

- [ ] **Step 3: Write minimal implementation**

```ts
const APP_NAME = "拼豆豆";

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
  cleanupOutdatedCaches: boolean;
  clientsClaim: boolean;
}

export function resolvePwaScope(basePath: string) {
  return basePath === "/" ? "/" : basePath;
}

export function buildPwaManifest(basePath: string): PwaManifestDefinition {
  const scope = resolvePwaScope(basePath);
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "拼豆图纸转换、编辑与导出工具",
    theme_color: "#f5e8d2",
    background_color: "#f5e8d2",
    display: "standalone",
    start_url: scope,
    scope,
    icons: [
      { src: `${scope}pwa-192x192.png`, sizes: "192x192", type: "image/png" },
      { src: `${scope}pwa-512x512.png`, sizes: "512x512", type: "image/png" },
      { src: `${scope}apple-touch-icon.png`, sizes: "180x180", type: "image/png" },
    ],
  };
}

export function buildPwaWorkboxConfig(basePath: string): PwaWorkboxDefinition {
  return {
    globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm}"],
    navigateFallback: resolvePwaScope(basePath),
    cleanupOutdatedCaches: true,
    clientsClaim: true,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/pwa.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/pwa.test.ts src/lib/pwa.ts
git commit -m "test: add base-aware pwa config helpers"
```

### Task 2: Add a base-aware service worker registration helper

**Files:**
- Create: `src/lib/pwa-register.ts`
- Create: `tests/pwa-register.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, expect, mock, test } from "bun:test";
import { buildServiceWorkerUrl, registerPwaServiceWorker } from "../src/lib/pwa-register";

afterEach(() => {
  mock.restore();
});

test("buildServiceWorkerUrl should stay under the Vite base path", () => {
  expect(buildServiceWorkerUrl("/pdd/")).toBe("/pdd/sw.js");
  expect(buildServiceWorkerUrl("/")).toBe("/sw.js");
});

test("registerPwaServiceWorker should register when supported", async () => {
  const register = mock(async () => ({ scope: "/pdd/" }));
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { serviceWorker: { register } },
  });

  await registerPwaServiceWorker("/pdd/");

  expect(register).toHaveBeenCalledWith("/pdd/sw.js");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/pwa-register.test.ts`
Expected: FAIL with `Cannot find module '../src/lib/pwa-register'`.

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildServiceWorkerUrl(baseUrl: string) {
  return `${baseUrl}sw.js`;
}

export async function registerPwaServiceWorker(baseUrl: string) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  await navigator.serviceWorker.register(buildServiceWorkerUrl(baseUrl));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/pwa-register.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/pwa-register.test.ts src/lib/pwa-register.ts
git commit -m "test: add pwa registration helper"
```

### Task 3: Integrate PWA helpers into the Vite build

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json`
- Test: `tests/pwa.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import viteConfig from "../vite.config";

test("vite config should expose a manifest-backed PWA build for subpath deploys", async () => {
  process.env.PINDOU_BASE_PATH = "/pdd/";
  const resolved = await viteConfig({ command: "build", mode: "test" });
  const plugins = resolved.plugins ?? [];
  expect(plugins.length).toBeGreaterThan(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/pwa.test.ts`
Expected: FAIL because the config does not yet include the PWA plugin.

- [ ] **Step 3: Write minimal implementation**

```ts
import { VitePWA } from "vite-plugin-pwa";
import { buildPwaManifest, buildPwaWorkboxConfig } from "./src/lib/pwa";

export function normalizeBasePath(input?: string) {
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
        base: basePath,
        manifest: buildPwaManifest(basePath),
        workbox: buildPwaWorkboxConfig(basePath),
        includeAssets: ["favicon.svg", "apple-touch-icon.png", "pwa-192x192.png", "pwa-512x512.png"],
      }),
    ],
    base: basePath,
  };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/pwa.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json vite.config.ts tests/pwa.test.ts src/lib/pwa.ts
git commit -m "feat: add vite pwa build configuration"
```

### Task 4: Register the service worker from the app entrypoint

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/lib/pwa-register.ts`
- Test: `tests/pwa-register.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { shouldRegisterPwaServiceWorker } from "../src/lib/pwa-register";

test("shouldRegisterPwaServiceWorker should skip registration outside production browser builds", () => {
  expect(shouldRegisterPwaServiceWorker({ DEV: true, PROD: false })).toBe(false);
  expect(shouldRegisterPwaServiceWorker({ DEV: false, PROD: true })).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/pwa-register.test.ts`
Expected: FAIL because `shouldRegisterPwaServiceWorker` is not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
export function shouldRegisterPwaServiceWorker(env: { DEV: boolean; PROD: boolean }) {
  return env.PROD && !env.DEV;
}
```

Update `src/main.tsx`:

```ts
import { registerPwaServiceWorker, shouldRegisterPwaServiceWorker } from "./lib/pwa-register";

if (shouldRegisterPwaServiceWorker(import.meta.env)) {
  void registerPwaServiceWorker(import.meta.env.BASE_URL);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/pwa-register.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx src/lib/pwa-register.ts tests/pwa-register.test.ts
git commit -m "feat: register pwa service worker in production"
```

### Task 5: Add installable icon assets and manifest-facing metadata

**Files:**
- Create: `public/pwa-192x192.png`
- Create: `public/pwa-512x512.png`
- Create: `public/apple-touch-icon.png`
- Modify: `index.html`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { buildPwaManifest } from "../src/lib/pwa";

test("buildPwaManifest should expose installable PNG icons", () => {
  expect(buildPwaManifest("/pdd/").icons).toEqual([
    expect.objectContaining({ src: "/pdd/pwa-192x192.png", sizes: "192x192" }),
    expect.objectContaining({ src: "/pdd/pwa-512x512.png", sizes: "512x512" }),
    expect.objectContaining({ src: "/pdd/apple-touch-icon.png", sizes: "180x180" }),
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/pwa.test.ts`
Expected: FAIL until the icon list includes the installable PNG assets.

- [ ] **Step 3: Write minimal implementation**

Use the existing brand mark to generate:

```text
public/pwa-192x192.png
public/pwa-512x512.png
public/apple-touch-icon.png
```

Add explicit install-surface metadata in `index.html`:

```html
<meta name="theme-color" content="#f5e8d2" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/pwa.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/pwa-192x192.png public/pwa-512x512.png public/apple-touch-icon.png index.html src/lib/pwa.ts tests/pwa.test.ts
git commit -m "feat: add installable pwa icons"
```

### Task 6: Verify production build output and offline assets

**Files:**
- Modify: `tests/pwa.test.ts`
- Verify: `dist/manifest.webmanifest`, `dist/sw.js`, `dist/workbox-*.js`, `dist/*.wasm`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

test("production build should emit manifest and service worker assets", () => {
  const distDir = join(process.cwd(), "dist");
  expect(existsSync(join(distDir, "manifest.webmanifest"))).toBe(true);
  expect(existsSync(join(distDir, "sw.js"))).toBe(true);

  const manifest = JSON.parse(readFileSync(join(distDir, "manifest.webmanifest"), "utf8"));
  expect(manifest.start_url).toBe("/pdd/");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/pwa.test.ts`
Expected: FAIL before a fresh build has generated the PWA output.

- [ ] **Step 3: Write minimal implementation**

Do not change production code first. Generate the output with the new configuration:

```bash
$env:PINDOU_BASE_PATH='/pdd/'; bun run build
```

Then adjust the test to read the built files only after the build step has completed in this task sequence.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/pwa.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/pwa.test.ts
git commit -m "test: verify pwa production build output"
```

### Task 7: Full verification before completion

**Files:**
- Verify only

- [ ] **Step 1: Run the targeted PWA tests**

Run: `bun test tests/pwa.test.ts tests/pwa-register.test.ts`
Expected: PASS with 0 failures.

- [ ] **Step 2: Run the full test suite**

Run: `bun test`
Expected: PASS with 0 failures.

- [ ] **Step 3: Run the production build with deployed base path**

Run: `$env:PINDOU_BASE_PATH='/pdd/'; bun run build`
Expected: exit code 0 and PWA assets emitted into `dist/`.

- [ ] **Step 4: Inspect emitted offline assets**

Run: `Get-ChildItem dist`
Expected: includes `manifest.webmanifest`, `sw.js`, Workbox runtime files, app icons, and the detector WASM asset.

- [ ] **Step 5: Commit**

```bash
git add package.json vite.config.ts src/main.tsx src/lib/pwa.ts src/lib/pwa-register.ts tests/pwa.test.ts tests/pwa-register.test.ts public/pwa-192x192.png public/pwa-512x512.png public/apple-touch-icon.png index.html
git commit -m "feat: ship offline installable pwa support"
```
