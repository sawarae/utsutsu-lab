/**
 * cup-detector-mediapipe.js
 * MediaPipe Tasks Vision ObjectDetector を使ったカップ検知。
 * 既存の CupDetector と同じインターフェースを持つ。
 *
 * 依存: @mediapipe/tasks-vision (CDN)
 * <script src="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.js"></script>
 */

// COCO label names that correspond to drinking vessels
const CUP_LABELS = new Set(['cup', 'bowl', 'wine glass', 'bottle', 'vase']);

class CupDetectorMediaPipe {
  /**
   * @param {object} opts
   * @param {number} [opts.scoreThreshold=0.35]   minimum confidence score
   * @param {string} [opts.modelUrl]              override model URL
   */
  constructor(opts = {}) {
    this._threshold = opts.scoreThreshold ?? 0.35;
    this._modelUrl  = opts.modelUrl ??
      'https://storage.googleapis.com/mediapipe-models/object_detector/' +
      'efficientdet_lite0/float16/1/efficientdet_lite0.tflite';

    this._detector  = null;  // MediaPipe ObjectDetector instance
    this._ready     = false;
    this.smoothed   = null;
    this.confidence = 0;
    this._alpha     = 0.3;

    this._initPromise = this._init();
  }

  /** Returns true once the model has loaded. */
  get ready() { return this._ready; }

  /** Resolves when model is loaded. */
  async waitUntilReady() { return this._initPromise; }

  /**
   * Detect cup from a video element.
   * @param {HTMLVideoElement|HTMLCanvasElement} src
   * @param {number} srcW
   * @param {number} srcH
   * @returns {{x,y,r}|null}
   */
  detect(src, srcW, srcH) {
    if (!this._ready || !this._detector) return this.smoothed;

    let results;
    try {
      results = this._detector.detectForVideo(src, performance.now());
    } catch (e) {
      console.warn('[CupDetectorMediaPipe] detectForVideo error:', e);
      return this.smoothed;
    }

    // Pick the highest-confidence cup-like detection
    let best = null;
    for (const det of (results.detections ?? [])) {
      const label = det.categories?.[0]?.categoryName ?? '';
      const score = det.categories?.[0]?.score      ?? 0;
      if (!CUP_LABELS.has(label)) continue;
      if (score < this._threshold) continue;
      if (!best || score > (best.categories?.[0]?.score ?? 0)) best = det;
    }

    if (!best) {
      this.confidence = Math.max(0, this.confidence - 0.05);
      return this.smoothed;
    }

    this.confidence = Math.min(1, this.confidence + 0.15);

    const b = best.boundingBox;
    const raw = {
      x: b.originX + b.width  / 2,
      y: b.originY + b.height / 2,
      r: Math.min(b.width, b.height) / 2,
    };

    if (!this.smoothed) {
      this.smoothed = { ...raw };
    } else {
      const a = this._alpha;
      this.smoothed.x += (raw.x - this.smoothed.x) * a;
      this.smoothed.y += (raw.y - this.smoothed.y) * a;
      this.smoothed.r += (raw.r - this.smoothed.r) * a;
    }

    return { ...this.smoothed };
  }

  reset() {
    this.smoothed   = null;
    this.confidence = 0;
  }

  // ── private ──────────────────────────────────────────────────────────────

  async _init() {
    try {
      // ObjectDetector is exposed on the global after vision_bundle.js loads
      const { ObjectDetector, FilesetResolver } =
        (typeof ObjectDetector !== 'undefined')
          ? { ObjectDetector, FilesetResolver }
          : window; // vision_bundle.js exposes globals

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      this._detector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: this._modelUrl,
          delegate: 'GPU',
        },
        scoreThreshold: this._threshold,
        runningMode: 'VIDEO',
      });

      this._ready = true;
      console.log('[CupDetectorMediaPipe] model loaded');
    } catch (err) {
      console.error('[CupDetectorMediaPipe] init failed:', err);
      // Fallback: mark as ready so detect() just returns null gracefully
      this._ready = true;
    }
  }
}
