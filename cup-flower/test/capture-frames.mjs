/**
 * capture-frames.mjs
 * Headless Chromium + Puppeteer で桜アニメーションのフレームをキャプチャ。
 * node test/capture-frames.mjs
 */

import puppeteer from '../node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core-browser.js';

// fallback: try CJS if ESM import fails
