import { afterEach, expect, mock, test } from "bun:test";
import {
  buildServiceWorkerUrl,
  registerPwaServiceWorker,
  shouldRegisterPwaServiceWorker,
} from "../src/lib/pwa-register";

const originalNavigator = globalThis.navigator;

afterEach(() => {
  mock.restore();
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
});

test("buildServiceWorkerUrl should stay under the Vite base path", () => {
  expect(buildServiceWorkerUrl("/pdd/")).toBe("/pdd/sw.js");
  expect(buildServiceWorkerUrl("/")).toBe("/sw.js");
});

test("shouldRegisterPwaServiceWorker should skip registration outside production browser builds", () => {
  expect(shouldRegisterPwaServiceWorker({ DEV: true, PROD: false })).toBe(false);
  expect(shouldRegisterPwaServiceWorker({ DEV: false, PROD: true })).toBe(true);
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

test("registerPwaServiceWorker should no-op when service workers are unavailable", async () => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
  });

  await expect(registerPwaServiceWorker("/pdd/")).resolves.toBeUndefined();
});
