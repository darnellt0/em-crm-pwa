/// <reference types="@capacitor/app" />
/// <reference types="@capacitor/splash-screen" />
/// <reference types="@capacitor/status-bar" />

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.elevatedmovements.crm",
  appName: "EM CRM",
  webDir: "www",
  backgroundColor: "#ffffff",
  appendUserAgent: " EMCRM/1.0",
  loggingBehavior: "debug",
  server: {
    androidScheme: "https",
    cleartext: false,
    allowNavigation: ["crm.elevatedmovements.com"],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#ffffff",
  },
  ios: {
    allowsLinkPreview: false,
    backgroundColor: "#ffffff",
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: true,
    preferredContentMode: "mobile",
  },
  plugins: {
    StatusBar: {
      style: "DARK",
      backgroundColor: "#ffffff",
      overlaysWebView: false,
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1000,
      backgroundColor: "#ffffff",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
  },
};

export default config;
