import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elevatedmovements.crm',
  appName: 'Elevated Movements CRM',
  webDir: 'www',

  // Allow navigation to Google Apps Script and auth domains
  server: {
    allowNavigation: [
      'script.google.com',
      'accounts.google.com',
      '*.googleusercontent.com',
      'www.google.com',
      'ssl.gstatic.com'
    ],
    // Force HTTPS only
    cleartext: false
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#36013f',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },

    StatusBar: {
      style: 'DARK',
      backgroundColor: '#36013f'
    },

    App: {
      // Deep link configuration
      // iOS: emcrm://
      // Android: emcrm://
      // Universal Links placeholder (update with actual domain)
      // iOS Associated Domains: applinks:elevatedmovements.com
    }
  },

  // iOS specific configuration
  ios: {
    contentInset: 'automatic',
    scheme: 'EM CRM'
  },

  // Android specific configuration
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true
  }
};

export default config;
