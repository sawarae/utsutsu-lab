'use strict';
const puppeteer = require('../node_modules/puppeteer-core/lib/cjs/puppeteer/puppeteer-core.js');
const path = require('path');
const fs = require('fs');

async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/snap/bin/chromium',
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
           '--enable-webgl','--use-gl=swiftshader','--ignore-gpu-blocklist','--disable-gpu-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 480 });

  // Collect console messages and errors
  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`));

  const url = 'file://' + path.join(__dirname, 'test-static.html');
  await page.goto(url, { waitUntil: 'load', timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));

  // Check state
  const info = await page.evaluate(() => ({
    isReady: typeof window.isReady === 'function' ? window.isReady() : 'fn missing',
    rendererExists: typeof CherryRenderer !== 'undefined',
    imgLoaded: document.querySelector('img') ? document.querySelector('img').complete : 'no img',
    webglSupport: !!document.createElement('canvas').getContext('webgl'),
  }));

  console.log('Page info:', JSON.stringify(info, null, 2));
  console.log('Console logs:', logs.slice(0, 20));

  // Take debug screenshot
  await page.screenshot({ path: path.join(__dirname, 'debug.png'), clip: {x:0,y:0,width:640,height:480} });
  console.log('Screenshot: test/debug.png');

  await browser.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
