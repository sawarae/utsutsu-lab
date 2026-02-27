/**
 * cup-detector.js
 * Detects circular cups/bowls from camera frames using edge detection
 * and a simplified Hough Circle Transform.
 *
 * Works at reduced resolution (80x60) for real-time performance.
 */

class CupDetector {
  constructor() {
    // Detection resolution (much smaller than camera for speed)
    this.DW = 80;
    this.DH = 60;

    this._canvas = document.createElement('canvas');
    this._canvas.width  = this.DW;
    this._canvas.height = this.DH;
    this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });

    // Smoothed detection result (in detector-space coords)
    this.smoothed = null;
    this._alpha   = 0.25;   // EMA smoothing factor
    this._missCount = 0;    // consecutive missed frames
    this.confidence = 0;    // 0–1 detection confidence
  }

  /**
   * Detect cup circle in the given video/canvas source.
   * @param {HTMLVideoElement|HTMLCanvasElement} src
   * @param {number} srcW  width of source in pixels
   * @param {number} srcH  height of source in pixels
   * @returns {{x, y, r}|null}  circle in srcW×srcH coordinates
   */
  detect(src, srcW, srcH) {
    // Downscale
    this._ctx.drawImage(src, 0, 0, this.DW, this.DH);
    const imgData = this._ctx.getImageData(0, 0, this.DW, this.DH);

    const gray  = this._toGray(imgData.data);
    const edges = this._sobel(gray);
    const circ  = this._hough(edges);

    if (!circ) {
      this._missCount++;
      // After many misses, reset smoothing
      if (this._missCount > 20) {
        this.smoothed   = null;
        this.confidence = Math.max(0, this.confidence - 0.05);
      }
      return this.smoothed ? this._toSrcCoords(this.smoothed, srcW, srcH) : null;
    }

    this._missCount = 0;
    this.confidence = Math.min(1, this.confidence + 0.1);

    // Smooth via EMA
    if (!this.smoothed) {
      this.smoothed = { x: circ.x, y: circ.y, r: circ.r };
    } else {
      const a = this._alpha;
      this.smoothed.x += (circ.x - this.smoothed.x) * a;
      this.smoothed.y += (circ.y - this.smoothed.y) * a;
      this.smoothed.r += (circ.r - this.smoothed.r) * a;
    }

    return this._toSrcCoords(this.smoothed, srcW, srcH);
  }

  // Reset so next detect() starts fresh
  reset() {
    this.smoothed   = null;
    this._missCount = 0;
    this.confidence = 0;
  }

  // ── private ──────────────────────────────────────────────────

  _toSrcCoords(c, srcW, srcH) {
    const sx = srcW / this.DW;
    const sy = srcH / this.DH;
    return { x: c.x * sx, y: c.y * sy, r: c.r * (sx + sy) / 2 };
  }

  _toGray(data) {
    const n = this.DW * this.DH;
    const g = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      // Rec. 601 luma
      g[i] = (data[i * 4] * 77 + data[i * 4 + 1] * 150 + data[i * 4 + 2] * 29) >> 8;
    }
    return g;
  }

  _sobel(g) {
    const W = this.DW, H = this.DH;
    const out = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const gx =
          -g[(y-1)*W+(x-1)] - 2*g[y*W+(x-1)] - g[(y+1)*W+(x-1)]
          +g[(y-1)*W+(x+1)] + 2*g[y*W+(x+1)] + g[(y+1)*W+(x+1)];
        const gy =
          -g[(y-1)*W+(x-1)] - 2*g[(y-1)*W+x] - g[(y-1)*W+(x+1)]
          +g[(y+1)*W+(x-1)] + 2*g[(y+1)*W+x] + g[(y+1)*W+(x+1)];
        out[y * W + x] = Math.min(255, (Math.abs(gx) + Math.abs(gy)) >> 1);
      }
    }
    return out;
  }

  _hough(edges) {
    const W = this.DW, H = this.DH;
    const THR = 28;

    // Collect edge pixel coordinates
    const ep = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (edges[y * W + x] > THR) ep.push(x, y);
      }
    }
    if (ep.length < 16) return null;

    const minR  = 6;
    const maxR  = Math.min(W, H) / 2 - 2;
    const rStep = 2;
    const nAng  = 16;
    const dA    = (Math.PI * 2) / nAng;

    // Accumulator at half resolution to save memory/time
    const AW  = W >> 1;
    const AH  = H >> 1;
    const acc = new Float32Array(AW * AH);

    // Skip edge pixels to stay within budget (~100 points max)
    const epLen = ep.length; // ep stores x,y pairs → epLen/2 points
    const skip  = Math.max(2, Math.floor(epLen / 200)); // skip by 2 coords at a time

    for (let i = 0; i < epLen; i += skip * 2) {
      const ex = ep[i], ey = ep[i + 1];
      for (let r = minR; r < maxR; r += rStep) {
        for (let a = 0; a < nAng; a++) {
          const cx = Math.round(ex - r * Math.cos(a * dA)) >> 1;
          const cy = Math.round(ey - r * Math.sin(a * dA)) >> 1;
          if (cx >= 0 && cx < AW && cy >= 0 && cy < AH) {
            acc[cy * AW + cx] += 1;
          }
        }
      }
    }

    // Find accumulator peak
    let best = 0, bestI = -1;
    for (let i = 0; i < acc.length; i++) {
      if (acc[i] > best) { best = acc[i]; bestI = i; }
    }
    if (best < 4) return null;

    const cx = (bestI % AW) * 2 + 1;
    const cy = Math.floor(bestI / AW) * 2 + 1;

    // Verify: find the best-fitting radius for this center
    let bestR = minR, bestScore = 0;
    for (let r = minR; r < maxR; r += rStep) {
      let score = 0;
      for (let i = 0; i < epLen; i += skip * 2) {
        const dx = ep[i] - cx, dy = ep[i + 1] - cy;
        if (Math.abs(Math.sqrt(dx * dx + dy * dy) - r) < 3) score++;
      }
      if (score > bestScore) { bestScore = score; bestR = r; }
    }

    if (bestScore < 3) return null;
    return { x: cx, y: cy, r: bestR };
  }
}
