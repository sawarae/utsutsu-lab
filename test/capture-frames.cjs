/**
 * capture-frames.cjs
 * Headless Chromium + Puppeteer-core で桜アニメーションのフレームをキャプチャ。
 * 実行: node test/capture-frames.cjs
 */

'use strict';

const puppeteer = require('../node_modules/puppeteer-core/lib/cjs/puppeteer/puppeteer-core.js');
const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const FRAMES_DIR = path.join(__dirname, 'frames');
const HTML_PATH  = path.join(__dirname, 'test-static.html');
const CHROMIUM   = '/snap/bin/chromium';

// キャプチャ設定
const TOTAL_SEC   = 7;    // 撮影秒数
const FPS         = 10;   // GIF用フレームレート
const TOTAL_FRAMES = TOTAL_SEC * FPS;
const WAIT_MS     = 1000 / FPS;

async function main() {
  if (!fs.existsSync(CHROMIUM)) {
    console.error('Chromium not found:', CHROMIUM);
    process.exit(1);
  }
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  console.log('Launching Chromium (headless)...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--enable-webgl',
      '--use-gl=swiftshader',
      '--ignore-gpu-blocklist',
      '--disable-gpu-sandbox',
      '--window-size=640,480',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 480 });

  const url = 'file://' + HTML_PATH;
  console.log('Loading:', url);
  await page.goto(url, { waitUntil: 'networkidle0' });

  // 画像ロードと初期化を待つ
  await page.waitForFunction('window.isReady && window.isReady() === true', { timeout: 10000 });
  console.log(`Ready. Capturing ${TOTAL_FRAMES} frames @ ${FPS}fps...`);

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    const framePath = path.join(FRAMES_DIR, `frame_${String(i).padStart(4,'0')}.png`);
    await page.screenshot({ path: framePath, clip: { x: 0, y: 0, width: 640, height: 480 } });

    const t = (i / FPS).toFixed(1);
    if (i % FPS === 0) process.stdout.write(`  t=${t}s\n`);

    await new Promise(r => setTimeout(r, WAIT_MS));
  }

  await browser.close();
  console.log(`\nCaptured ${TOTAL_FRAMES} frames → test/frames/`);
}

main().catch(e => { console.error(e); process.exit(1); });
