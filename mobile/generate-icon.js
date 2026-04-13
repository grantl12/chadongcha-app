/**
 * generate-icon.js — renders the ㅊ app icon to PNG
 *
 * Requires:  npm install canvas
 * Usage:     node generate-icon.js
 *
 * Outputs:
 *   assets/icon.png           1024x1024  (iOS + EAS)
 *   assets/adaptive-icon.png  1024x1024  (Android foreground layer)
 *   assets/splash.png         1284x2778  (splash screen, centered)
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, 'assets');
const BG      = '#0a0a0a';
const ACCENT  = '#e63946';
const CHAR    = 'ㅊ';

function makeIcon(w, h) {
  const canvas = createCanvas(w, h);
  const ctx    = canvas.getContext('2d');

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  // Character — scale font relative to the shorter dimension
  const fontSize = Math.round(Math.min(w, h) * 0.65);
  ctx.fillStyle    = ACCENT;
  ctx.font         = `bold ${fontSize}px sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(CHAR, w / 2, h / 2);

  return canvas.toBuffer('image/png');
}

const files = [
  { name: 'icon.png',          w: 1024, h: 1024 },
  { name: 'adaptive-icon.png', w: 1024, h: 1024 },
  { name: 'splash.png',        w: 1284, h: 2778 },
];

for (const { name, w, h } of files) {
  const out = path.join(ASSETS, name);
  fs.writeFileSync(out, makeIcon(w, h));
  console.log(`  wrote ${out}`);
}

console.log('Done. Rebuild with EAS to pick up new assets.');
