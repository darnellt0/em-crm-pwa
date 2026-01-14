# Elevated Movements CRM - Mobile Distribution

This repository provides two ways to distribute the Elevated Movements CRM as a mobile app:

1. **PWA (Progressive Web App)** - Browser-based installable app
2. **Native Mobile App** - True native Android and iOS apps via Capacitor

## What's Included

### PWA Assets (Root Directory)
- **manifest.json** - PWA manifest file defining app properties, colors, and icons
- **icon-192.png** - 192x192 app icon (required for Android)
- **icon-512.png** - 512x512 app icon (required for maskable icon support)
- **tools/make_icons.py** - Python script to regenerate icons programmatically
- **.github/workflows/build-icons.yml** - CI workflow to verify icons are up-to-date

### Native Mobile App (mobile/ Directory)
- **Capacitor project** - Native Android and iOS app wrapper
- **Deep link support** - `emcrm://` URL scheme for direct navigation
- **Native features** - Camera, microphone, and native UI
- **No Google Apps Script banner** - Clean native experience
- See [mobile/README.md](./mobile/README.md) for full documentation

## How It Works

### PWA Approach
This repository uses GitHub Pages to serve static PWA assets that are referenced by the Google Apps Script web app. The manifest and icons cannot be hosted directly on Apps Script, so we host them here and link to them from the Apps Script HTML.

Once GitHub Pages is enabled, the assets will be served from:
```
https://YOUR_GH_USERNAME.github.io/em-crm-pwa/manifest.json
https://YOUR_GH_USERNAME.github.io/em-crm-pwa/icon-192.png
https://YOUR_GH_USERNAME.github.io/em-crm-pwa/icon-512.png
```

### Native App Approach
The `mobile/` directory contains a Capacitor project that wraps the Google Apps Script web app in a native WebView. This provides:
- True native Android and iOS apps
- Removal of Google Apps Script banner
- Deep link support (`emcrm://open?contact=Name`)
- Native camera and microphone access
- App Store / Play Store distribution

## Quick Start

Choose your distribution method:

### Option A: PWA (Browser-Based)
Follow the [PWA Setup Instructions](#pwa-setup-instructions) below.

### Option B: Native Mobile App
See the complete guide in [mobile/README.md](./mobile/README.md).

Quick commands:
```bash
cd mobile
npm install
npm run build
npm run add:android    # Add Android platform
npm run add:ios        # Add iOS platform (macOS only)
npm run open:android   # Open Android Studio
npm run open:ios       # Open Xcode
```

## PWA Setup Instructions

### 1. Create GitHub Repository

```bash
# Create new repo on GitHub named: em-crm-pwa
# Then push this code:
git init
git add .
git commit -m "Initial PWA assets for Elevated Movements CRM"
git branch -M main
git remote add origin https://github.com/YOUR_GH_USERNAME/em-crm-pwa.git
git push -u origin main
```

### 2. Enable GitHub Pages

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Pages**
3. Under **Source**, select:
   - Branch: `main`
   - Folder: `/ (root)`
4. Click **Save**
5. Wait 1-2 minutes for deployment
6. Verify your manifest is accessible at:
   `https://YOUR_GH_USERNAME.github.io/em-crm-pwa/manifest.json`

### 3. Update Apps Script HTML

Add the following code to the `<head>` section of your Apps Script `index.html` file:

```html
<!-- PWA Manifest -->
<link rel="manifest" href="https://YOUR_GH_USERNAME.github.io/em-crm-pwa/manifest.json">

<!-- Theme Color -->
<meta name="theme-color" content="#36013f">

<!-- iOS Support -->
<link rel="apple-touch-icon" href="https://YOUR_GH_USERNAME.github.io/em-crm-pwa/icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

<!-- Mobile Viewport -->
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

**IMPORTANT:** Replace `YOUR_GH_USERNAME` with your actual GitHub username!

### 4. Deploy New Apps Script Version

After updating the HTML:
1. In Apps Script editor, click **Deploy** → **Manage deployments**
2. Click the **Edit** (pencil) icon on your active deployment
3. Under **Version**, select **New version**
4. Add description: "Added PWA support"
5. Click **Deploy**
6. Use the new deployment URL

### 5. Test the Installation

#### On iPhone (Safari):
1. Open your Apps Script web app URL in Safari
2. Tap the **Share** button (square with arrow)
3. Scroll down and tap **Add to Home Screen**
4. Customize the name if desired
5. Tap **Add**
6. The app icon will appear on your home screen

#### On Android (Chrome):
1. Open your Apps Script web app URL in Chrome
2. Tap the **three dots** menu (⋮)
3. Tap **Install app** or **Add to Home Screen**
4. Confirm the installation
5. The app icon will appear on your home screen or app drawer

## Regenerating Icons

If you need to regenerate the icons (e.g., to change colors or text):

1. Install Python dependencies:
   ```bash
   pip install Pillow
   ```

2. Edit `tools/make_icons.py` to customize:
   - `BG_COLOR` - Background color (currently `#36013f`)
   - `TEXT_COLOR` - Text color (currently `#ffffff`)
   - `text` variable in `create_icon()` - Icon text (currently "EM")

3. Run the generator:
   ```bash
   python tools/make_icons.py
   ```

4. Commit and push the updated icons:
   ```bash
   git add icon-192.png icon-512.png
   git commit -m "Regenerate icons"
   git push
   ```

## PWA Configuration

The manifest.json is configured with:

- **App Name:** Elevated Movements CRM
- **Short Name:** EM CRM
- **Theme Color:** `#36013f` (deep purple)
- **Background Color:** `#f8f9fa` (light gray)
- **Display Mode:** `standalone` (full-screen, no browser UI)
- **Start URL:** Your Google Apps Script deployment URL
- **Scope:** Apps Script domain scope

## CI/CD

The GitHub Actions workflow automatically:
- Verifies icons exist and have correct dimensions (192x192 and 512x512)
- Ensures generated icons match committed versions
- Fails if icons need to be regenerated and committed

## Troubleshooting

### Icons don't appear
- Verify GitHub Pages is enabled and deployment succeeded
- Check browser console for 404 errors on icon URLs
- Ensure manifest.json URL is accessible
- Try clearing browser cache

### "Add to Home Screen" option missing
- On iOS: Must use Safari (not Chrome or other browsers)
- On Android: Must use Chrome (or Chromium-based browser)
- Ensure HTTPS is used (GitHub Pages and Apps Script both use HTTPS)
- Check that manifest.json is properly formatted and accessible

### App doesn't open in standalone mode
- Verify `display: "standalone"` in manifest.json
- Check that the start_url and scope match your Apps Script URL
- Try uninstalling and reinstalling the PWA

## Technical Details

**Web App URL:**
```
https://script.google.com/macros/s/AKfycbymRy5KW0vqL-cHcU73wzZtNe3J8syB8tbFVeM2wCzFpUCrJEF_BabEWSQSXLdSpdRH/exec
```

**Scope:**
```
https://script.google.com/macros/s/AKfycbymRy5KW0vqL-cHcU73wzZtNe3J8syB8tbFVeM2wCzFpUCrJEF_BabEWSQSXLdSpdRH/
```

## License

This repository contains assets for the Elevated Movements CRM application.

## Build EM CRM App (Native Mobile)

For complete native mobile app build instructions, see:

**[mobile/README.md](./mobile/README.md)**

Key features:
- Removes Google Apps Script banner
- Deep link support: `emcrm://open?contact=Name`
- Camera & microphone permissions
- App Store & Play Store ready
- Full native experience

## Support

For issues with:
- **PWA installation** → Check the PWA troubleshooting section above
- **Native mobile app** → See [mobile/README.md](./mobile/README.md)
- **Apps Script functionality** → Contact Elevated Movements support
- **Icon generation** → Review `tools/make_icons.py` script
