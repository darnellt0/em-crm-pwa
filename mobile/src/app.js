/**
 * Elevated Movements CRM - Mobile App Logic
 * Handles deep linking and navigation to Google Apps Script web app
 */

// Base URL for the Google Apps Script web app
const BASE_URL = 'https://script.google.com/macros/s/AKfycbymRy5KW0vqL-cHcU73wzZtNe3J8syB8tbFVeM2wCzFpUCrJEF_BabEWSQSXLdSpdRH/exec';

// State management
let currentUrl = BASE_URL;
let isAppReady = false;

/**
 * Initialize the app when DOM is ready
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('EM CRM App initializing...');

  try {
    // Wait for Capacitor to be ready
    await waitForCapacitor();

    // Initialize Capacitor plugins
    await initializePlugins();

    // Set up deep link listener
    setupDeepLinkListener();

    // Load the CRM web app
    loadCRM(currentUrl);

    isAppReady = true;
    console.log('EM CRM App ready!');
  } catch (error) {
    console.error('App initialization error:', error);
    showError('Failed to initialize app. Please restart.');
  }
});

/**
 * Wait for Capacitor to be available
 */
function waitForCapacitor() {
  return new Promise((resolve) => {
    if (window.Capacitor) {
      resolve();
    } else {
      const checkInterval = setInterval(() => {
        if (window.Capacitor) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    }
  });
}

/**
 * Initialize Capacitor plugins
 */
async function initializePlugins() {
  const { SplashScreen, StatusBar, App } = window.Capacitor.Plugins;

  try {
    // Configure status bar
    if (StatusBar) {
      await StatusBar.setStyle({ style: 'DARK' });
      await StatusBar.setBackgroundColor({ color: '#36013f' });
    }

    // App state listeners
    if (App) {
      App.addListener('appStateChange', ({ isActive }) => {
        console.log('App state changed. Active:', isActive);
      });

      App.addListener('backButton', () => {
        console.log('Back button pressed');
        // Could implement back navigation logic here
      });
    }
  } catch (error) {
    console.error('Plugin initialization error:', error);
  }
}

/**
 * Set up deep link listener
 * Handles: emcrm://open?contact=Angela%20Davis
 * Converts to: .../exec?open=Angela%20Davis
 */
function setupDeepLinkListener() {
  const { App } = window.Capacitor.Plugins;

  if (!App) {
    console.warn('App plugin not available');
    return;
  }

  App.addListener('appUrlOpen', (event) => {
    console.log('Deep link received:', event.url);

    try {
      const url = new URL(event.url);

      // Handle emcrm:// scheme
      if (url.protocol === 'emcrm:') {
        handleDeepLink(url);
      }
    } catch (error) {
      console.error('Deep link parsing error:', error);
    }
  });

  console.log('Deep link listener registered');
}

/**
 * Handle deep link navigation
 * @param {URL} url - The deep link URL
 */
function handleDeepLink(url) {
  console.log('Processing deep link:', url.href);

  // Extract the path and query parameters
  const path = url.hostname || url.pathname.replace(/^\/+/, '');
  const params = new URLSearchParams(url.search);

  // Handle different deep link routes
  if (path === 'open' || path === '') {
    // Get the contact parameter
    const contact = params.get('contact');

    if (contact) {
      // Build the new URL with query parameter
      const targetUrl = `${BASE_URL}?open=${encodeURIComponent(contact)}`;
      console.log('Navigating to:', targetUrl);

      // Navigate to the URL
      loadCRM(targetUrl);
    } else {
      // No specific contact, just open the app
      loadCRM(BASE_URL);
    }
  } else {
    console.warn('Unknown deep link path:', path);
    // Default to base URL
    loadCRM(BASE_URL);
  }
}

/**
 * Load the CRM web app in iframe
 * @param {string} url - The URL to load
 */
function loadCRM(url) {
  console.log('Loading CRM:', url);

  const iframe = document.getElementById('crm-frame');
  const loadingScreen = document.getElementById('loading-screen');
  const appContainer = document.getElementById('app-container');

  // Update current URL
  currentUrl = url;

  // Set iframe source
  iframe.src = url;

  // Show loading screen
  loadingScreen.style.display = 'flex';
  appContainer.style.display = 'none';

  // Wait for iframe to load
  iframe.onload = async () => {
    console.log('CRM loaded successfully');

    // Hide loading screen
    setTimeout(async () => {
      loadingScreen.style.display = 'none';
      appContainer.style.display = 'block';

      // Hide splash screen after content is visible
      const { SplashScreen } = window.Capacitor.Plugins;
      if (SplashScreen) {
        await SplashScreen.hide();
      }
    }, 500);
  };

  // Handle iframe load errors
  iframe.onerror = (error) => {
    console.error('CRM load error:', error);
    showError('Failed to load CRM. Please check your connection.');
  };
}

/**
 * Show error message to user
 * @param {string} message - Error message
 */
function showError(message) {
  const loadingScreen = document.getElementById('loading-screen');
  const loadingContent = loadingScreen.querySelector('.loading-content');

  loadingContent.innerHTML = `
    <div class="error-icon">⚠️</div>
    <p class="error-text">${message}</p>
    <button class="retry-button" onclick="location.reload()">Retry</button>
  `;
}

/**
 * Handle window messages from iframe (if needed)
 */
window.addEventListener('message', (event) => {
  // Verify origin
  if (!event.origin.includes('script.google.com')) {
    return;
  }

  console.log('Message from CRM:', event.data);

  // Handle specific messages from the web app if needed
  // Example: if (event.data.action === 'navigate') { ... }
});

// Prevent default context menu on long press (optional)
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// Log app info
console.log('EM CRM Mobile App v1.0.0');
console.log('Base URL:', BASE_URL);
