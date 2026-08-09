"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { resolveMobileDeepLink } from "@/lib/mobileLinks";

export function MobileAppBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    let removeListener: (() => Promise<void>) | undefined;

    document.documentElement.classList.add("capacitor-native");

    void (async () => {
      try {
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setOverlaysWebView({ overlay: false });
        if (Capacitor.getPlatform() === "android") {
          await StatusBar.setBackgroundColor({ color: "#ffffff" });
        }
      } catch {
        // capacitor.config.ts provides equivalent native defaults.
      }

      const handle = await App.addListener("appUrlOpen", ({ url }) => {
        const target = resolveMobileDeepLink(url);
        if (target && target !== window.location.href) {
          window.location.assign(target);
        }
      });

      if (cancelled) {
        await handle.remove();
      } else {
        removeListener = () => handle.remove();
      }
    })();

    return () => {
      cancelled = true;
      document.documentElement.classList.remove("capacitor-native");
      if (removeListener) void removeListener();
    };
  }, []);

  return null;
}
