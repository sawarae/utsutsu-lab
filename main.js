/**
 * main.js
 * Application orchestrator for the Sakura Projection demo.
 *
 * State machine:
 *   IDLE → DETECTING → PROJECTING ⇄ SCATTERING → REDETECTING → DETECTING …
 *
 * Cup detection runs every DETECT_INTERVAL frames for performance.
 * Manual cup placement is supported by clicking/tapping on the canvas.
 */

"use strict";

// ── Constants ──────────────────────────────────────────────────────────────

const W = 640;
const H = 480;

const DETECT_INTERVAL = 6; // process every Nth frame
const SCATTER_DURATION = 2.8; // seconds for scatter animation
const REDETECT_DELAY = 1.8; // seconds after scatter before re-detecting
const FALLBACK_RADIUS = 100; // default radius when using manual placement
const CONFIRM_DELAY = 5.0; // seconds of continuous detection before showing blossoms
const MISSING_BEFORE_SCATTER = 20; // consecutive missed detections before scattering (~2s)

// ── State ──────────────────────────────────────────────────────────────────

const AppState = Object.freeze({
  IDLE: "idle",
  DETECTING: "detecting",
  PROJECTING: "projecting",
  SCATTERING: "scattering",
  REDETECTING: "redetecting",
});

let state = AppState.IDLE;
let stateTs = 0; // performance.now() when state last changed

let cup = null; // current cup {x, y, r}
let blossomAlpha = 0;
let frameCount = 0;
let appStartTs = 0; // performance.now() at camera start
let detectedSince = null; // performance.now() when cup was first continuously detected
let projectionStartTs = 0; // performance.now() when PROJECTING state started
let projectionMissCount = 0; // consecutive missed detections while PROJECTING

// ── DOM ────────────────────────────────────────────────────────────────────

const hintOverlay = document.getElementById("hint-overlay");
const startBtn = document.getElementById("start-btn");
const statusBar = document.getElementById("status-bar");
const cameraCanvas = document.getElementById("camera-canvas");
const overlayCanvas = document.getElementById("overlay-canvas");
const blossomCanvas = document.getElementById("blossom-canvas");

const cameraCtx = cameraCanvas.getContext("2d");
const overlayCtx = overlayCanvas.getContext("2d");

// ── Module instances ────────────────────────────────────────────────────────

let video = null;
let detector = null;
let renderer = null;

// ── Helpers ─────────────────────────────────────────────────────────────────

function setStatus(msg) {
  statusBar.textContent = msg;
}

function setState(s) {
  state = s;
  stateTs = performance.now();
}

function stateAge() {
  return (performance.now() - stateTs) / 1000; // seconds since last state change
}

function appTime() {
  return (performance.now() - appStartTs) / 1000;
}

// ── Camera setup ─────────────────────────────────────────────────────────────

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  setStatus("カメラにアクセス中…");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: W, height: H, facingMode: "environment" },
      audio: false,
    });

    video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    await video.play();

    detector = new CupDetector();
    renderer = new CherryRenderer(blossomCanvas);

    hintOverlay.style.display = "none";
    appStartTs = performance.now();

    setState(AppState.DETECTING);
    setStatus("器（コップ・茶碗・ペットボトル）をカメラに向けてください");

    requestAnimationFrame(loop);
  } catch (err) {
    setStatus("カメラへのアクセスに失敗: " + err.message);
    startBtn.disabled = false;
  }
});

// ── Manual cup placement (click/tap) ─────────────────────────────────────────

cameraCanvas.addEventListener("click", (e) => {
  if (state === AppState.IDLE) return;
  const rect = cameraCanvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const scaleY = H / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  cup = { x: mx, y: my, r: FALLBACK_RADIUS };
  if (detector) detector.reset();

  projectionStartTs = performance.now();
  setState(AppState.PROJECTING);
  setStatus("🌸 桜が咲いています（手動配置）");
});

// ── Main loop ─────────────────────────────────────────────────────────────────

function loop(ts) {
  const t = appTime();

  // Draw camera feed
  if (video && video.readyState >= 2) {
    cameraCtx.drawImage(video, 0, 0, W, H);
  }

  // Cup detection (throttled)
  frameCount++;
  if (
    frameCount % DETECT_INTERVAL === 0 &&
    state !== AppState.IDLE &&
    state !== AppState.SCATTERING
  ) {
    runDetect();
  }

  // State transitions
  switch (state) {
    case AppState.SCATTERING:
      if (stateAge() >= SCATTER_DURATION) {
        cup = null;
        if (detector) detector.reset();
        setState(AppState.REDETECTING);
        setStatus("また器を探しています…");
      }
      break;

    case AppState.REDETECTING:
      if (stateAge() >= REDETECT_DELAY) {
        detectedSince = null;
        setState(AppState.DETECTING);
        setStatus("器（コップ・茶碗・ペットボトル）をカメラに向けてください");
      }
      break;

    default:
      break;
  }

  // Blossom alpha fade
  const wantBlossom =
    state === AppState.PROJECTING || state === AppState.SCATTERING;
  blossomAlpha += wantBlossom
    ? Math.min(0.025, 1 - blossomAlpha) // fade in
    : -Math.min(0.02, blossomAlpha); // fade out

  // Render overlay (detected circle indicator)
  drawOverlay();

  // Render cherry blossoms
  drawBlossoms(t);

  requestAnimationFrame(loop);
}

// ── Detection ─────────────────────────────────────────────────────────────────

function runDetect() {
  if (!detector) return;

  const detected = detector.detect(video, W, H);

  if (detected) {
    projectionMissCount = 0;
    cup = detected;

    if (state === AppState.DETECTING) {
      if (detectedSince === null) detectedSince = performance.now();
      const held = (performance.now() - detectedSince) / 1000;
      if (held >= CONFIRM_DELAY) {
        detectedSince = null;
        projectionStartTs = performance.now();
        projectionMissCount = 0;
        setState(AppState.PROJECTING);
        setStatus("🌸 桜が咲いています");
      } else {
        const remaining = Math.ceil(CONFIRM_DELAY - held);
        setStatus(`器を確認中… あと${remaining}秒`);
      }
    }
  } else {
    if (state === AppState.PROJECTING) {
      projectionMissCount++;
      if (projectionMissCount >= MISSING_BEFORE_SCATTER) {
        projectionMissCount = 0;
        setState(AppState.SCATTERING);
        setStatus("🌸 散っていく…");
      }
    } else if (state === AppState.DETECTING) {
      detectedSince = null;
      setStatus(
        detector.confidence < 0.3
          ? "器（コップ・茶碗・ペットボトル）をカメラに向けてください"
          : "器を追跡中…",
      );
    }
  }
}

// ── Overlay: draw detected circle ─────────────────────────────────────────────

function drawOverlay() {
  overlayCtx.clearRect(0, 0, W, H);

  if (!cup) return;
  if (state === AppState.IDLE || state === AppState.DETECTING) return;

  const confidence = detector ? detector.confidence : 1;
  const alpha = Math.min(confidence, blossomAlpha) * 0.45;

  overlayCtx.save();
  overlayCtx.strokeStyle = `rgba(255, 183, 197, ${alpha})`;
  overlayCtx.lineWidth = 1.5;
  overlayCtx.setLineDash([6, 4]);
  overlayCtx.beginPath();
  overlayCtx.arc(cup.x, cup.y, cup.r, 0, Math.PI * 2);
  overlayCtx.stroke();
  overlayCtx.restore();
}

// ── Bloom progress ────────────────────────────────────────────────────────────

function calcBloom() {
  if (projectionStartTs === 0) return 1.0;
  const age = (performance.now() - projectionStartTs) / 1000;
  // 0–6s: one flower gently appears (u_bloom 0 → 0.004, ~1 particle)
  if (age < 6) return (age / 6) * 0.004;
  // 6–60s: remaining flowers gradually join
  return 0.004 + Math.min(0.996, ((age - 6) / 54) * 0.996);
}

// ── Blossom render ────────────────────────────────────────────────────────────

function drawBlossoms(t) {
  if (!renderer) return;

  if (blossomAlpha <= 0.001) {
    renderer.clear();
    return;
  }

  // Determine scatter progress
  let scatter = 0;
  if (state === AppState.SCATTERING) {
    scatter = Math.min(1, stateAge() / SCATTER_DURATION);
  }

  // All particles visible during scatter; otherwise reveal gradually
  const bloom = state === AppState.SCATTERING ? 1.0 : calcBloom();

  // Use last known cup position or canvas centre as fallback
  const cx = cup ? cup.x : W / 2;
  const cy = cup ? cup.y : H / 2;
  const r = cup ? cup.r : FALLBACK_RADIUS;

  renderer.render(cx, cy, r, scatter, blossomAlpha, t, bloom);
}
