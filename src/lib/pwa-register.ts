export function buildServiceWorkerUrl(baseUrl: string) {
  return `${baseUrl}sw.js`;
}

export function shouldRegisterPwaServiceWorker(env: { DEV: boolean; PROD: boolean }) {
  return env.PROD && !env.DEV;
}

export async function registerPwaServiceWorker(baseUrl: string) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  await navigator.serviceWorker.register(buildServiceWorkerUrl(baseUrl));
}
