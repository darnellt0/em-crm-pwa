import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { CRM_ORIGIN, resolveAppUrl } from "./links.js";

const status = document.querySelector("#status");
const retry = document.querySelector("#retry");
const spinner = document.querySelector(".spinner");
let pendingTarget = `${CRM_ORIGIN}/`;

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js", { scope: "./" });
  } catch {
    // The bundled shell remains usable when a native WebView omits SW support.
  }
}

async function configureNativeShell() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setOverlaysWebView({ overlay: false });
    if (Capacitor.getPlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: "#ffffff" });
    }
  } catch {
    // Native config supplies the same defaults if a device rejects a runtime call.
  }

  await App.addListener("appUrlOpen", ({ url }) => {
    const target = resolveAppUrl(url);
    if (target) void openCrm(target);
  });
}

async function crmIsReachable() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(`${CRM_ORIGIN}/api/health`, {
      cache: "no-store",
      mode: "no-cors",
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function openCrm(target = pendingTarget) {
  pendingTarget = target;
  status.textContent = "Connecting securely…";
  retry.hidden = true;
  spinner.hidden = false;

  if (!(await crmIsReachable())) {
    status.textContent = "EM CRM is unavailable while this phone is offline.";
    spinner.hidden = true;
    retry.hidden = false;
    return;
  }

  window.location.replace(target);
}

retry.addEventListener("click", () => void openCrm());

await registerServiceWorker();
await configureNativeShell();

if (Capacitor.isNativePlatform()) {
  try {
    const launch = await App.getLaunchUrl();
    pendingTarget = resolveAppUrl(launch?.url) ?? pendingTarget;
  } catch {
    // Continue to the CRM home route when no launch URL is available.
  }
}

void openCrm(pendingTarget);
