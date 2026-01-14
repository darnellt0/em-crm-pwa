#!/usr/bin/env node
/**
 * Build script for EM CRM Capacitor app
 * Copies src/ files to www/ directory for Capacitor to consume
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const wwwDir = path.join(__dirname, 'www');

// Clean www directory
if (fs.existsSync(wwwDir)) {
  fs.rmSync(wwwDir, { recursive: true, force: true });
}

// Create www directory
fs.mkdirSync(wwwDir, { recursive: true });

// Copy all files from src to www
function copyDirectory(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Building EM CRM mobile app...');
copyDirectory(srcDir, wwwDir);
console.log('Build complete! Output: www/');
