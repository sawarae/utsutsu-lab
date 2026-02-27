"""
compare-detectors.py
Hough 円変換 vs MediaPipe EfficientDet でカップ検出を比較し、
各画像の結果を並べた比較画像と summary GIF を生成する。

Usage: /home/ubuntu/workdir/venv/bin/python3 test/compare-detectors.py
"""

import cv2, math, time
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

ROOT        = Path(__file__).parent.parent
ASSETS      = ROOT / 'test' / 'assets'
MODELS      = ROOT / 'test' / 'models'
RESULTS_DIR = ROOT / 'test' / 'results'
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

MODEL_PATH = MODELS / 'efficientdet_lite0.tflite'
CUP_LABELS = {'cup', 'bowl', 'wine glass', 'bottle', 'vase'}

CANVAS_W, CANVAS_H = 480, 320   # size of each panel in comparison image

# ── Hough circle detection (mirrors JS cup-detector.js logic) ──────────────

def hough_detect(img_bgr):
    """
    Detect the most prominent circle using OpenCV HoughCircles.
    Returns (cx, cy, r) in original image coords, or None.
    """
    h, w = img_bgr.shape[:2]
    # Downscale to ~320px wide for speed (mirrors JS 80x60 approach)
    scale = 320 / max(w, h)
    small = cv2.resize(img_bgr, (int(w * scale), int(h * scale)))
    gray  = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    gray  = cv2.GaussianBlur(gray, (5, 5), 0)

    sh, sw = small.shape[:2]
    min_r = int(min(sw, sh) * 0.10)
    max_r = int(min(sw, sh) * 0.48)

    circles = cv2.HoughCircles(
        gray,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=min(sw, sh) * 0.3,
        param1=80,   # Canny upper threshold
        param2=30,   # accumulator threshold
        minRadius=min_r,
        maxRadius=max_r,
    )

    if circles is None:
        return None

    best = circles[0][0]  # (cx, cy, r) at small scale
    return (
        int(best[0] / scale),
        int(best[1] / scale),
        int(best[2] / scale),
    )


# ── MediaPipe object detection ─────────────────────────────────────────────

def build_mediapipe_detector():
    base_opts = mp_python.BaseOptions(model_asset_path=str(MODEL_PATH))
    opts = mp_vision.ObjectDetectorOptions(
        base_options=base_opts,
        score_threshold=0.25,
        max_results=10,
    )
    return mp_vision.ObjectDetector.create_from_options(opts)


def mediapipe_detect(detector, img_bgr):
    """
    Run MediaPipe ObjectDetector and return best cup-like detection as
    (cx, cy, r) or None.
    """
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    mp_img  = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)

    result = detector.detect(mp_img)

    best_score = 0
    best_box   = None
    best_label = None

    for det in result.detections:
        cat   = det.categories[0]
        label = cat.category_name
        score = cat.score
        if label not in CUP_LABELS:
            continue
        if score > best_score:
            best_score = score
            best_box   = det.bounding_box
            best_label = f"{label} ({score:.0%})"

    if best_box is None:
        return None, None

    cx = int(best_box.origin_x + best_box.width  / 2)
    cy = int(best_box.origin_y + best_box.height / 2)
    r  = int(min(best_box.width, best_box.height) / 2)
    return (cx, cy, r), best_label


# ── Draw helper ────────────────────────────────────────────────────────────

def draw_result(img_pil: Image.Image, circle, label: str, color, title: str) -> Image.Image:
    """
    Resize img to CANVAS_W×CANVAS_H, overlay detection result, add title bar.
    """
    # Resize with letterbox
    iw, ih = img_pil.size
    scale  = min(CANVAS_W / iw, CANVAS_H / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    resized = img_pil.resize((nw, nh), Image.LANCZOS)

    canvas = Image.new('RGB', (CANVAS_W, CANVAS_H), (20, 20, 30))
    ox = (CANVAS_W - nw) // 2
    oy = (CANVAS_H - nh) // 2
    canvas.paste(resized, (ox, oy))

    draw = ImageDraw.Draw(canvas)

    # Overlay circle
    if circle:
        cx, cy, r = circle
        # Scale circle to canvas coords
        scx = int(cx * scale) + ox
        scy = int(cy * scale) + oy
        sr  = int(r  * scale)
        # Outer ring
        draw.ellipse([scx-sr-2, scy-sr-2, scx+sr+2, scy+sr+2],
                     outline=color + (80,), width=2)
        # Inner ring
        draw.ellipse([scx-sr, scy-sr, scx+sr, scy+sr],
                     outline=color + (220,), width=3)
        # Centre dot
        draw.ellipse([scx-5, scy-5, scx+5, scy+5], fill=color + (255,))
        if label:
            draw.text((scx - sr, scy - sr - 18), label,
                      fill=color + (230,))
    else:
        # No detection
        draw.text((CANVAS_W//2 - 50, CANVAS_H//2 - 10), '× not detected',
                  fill=(200, 80, 80))

    # Title bar at top
    draw.rectangle([0, 0, CANVAS_W, 28], fill=(0, 0, 0, 200))
    draw.text((8, 6), title, fill=(255, 255, 255))

    return canvas


# ── Build summary image (side-by-side grid) ────────────────────────────────

def build_summary(rows):
    """
    rows: list of (img_name, hough_panel, mp_panel)
    Returns a wide summary Image.
    """
    COLS = 2   # Hough | MediaPipe
    n    = len(rows)
    grid_w = CANVAS_W * COLS
    grid_h = CANVAS_H * n + 40  # top label bar

    out  = Image.new('RGB', (grid_w, grid_h), (12, 12, 20))
    draw = ImageDraw.Draw(out)

    # Column headers
    draw.rectangle([0, 0, grid_w, 36], fill=(30, 30, 45))
    draw.text((CANVAS_W//2 - 60, 10), 'Hough 円変換 (従来)',   fill=(180, 220, 255))
    draw.text((CANVAS_W + CANVAS_W//2 - 60, 10), 'MediaPipe EfficientDet', fill=(180, 255, 200))

    for i, (name, h_panel, mp_panel) in enumerate(rows):
        y = 40 + i * CANVAS_H
        out.paste(h_panel,  (0,          y))
        out.paste(mp_panel, (CANVAS_W,   y))

    return out


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    print('Loading MediaPipe model...')
    mp_detector = build_mediapipe_detector()
    print('Model ready.\n')

    image_files = sorted(ASSETS.glob('0*.jpg'))
    rows        = []
    report      = []

    for img_path in image_files:
        print(f'Processing: {img_path.name}')

        img_bgr = cv2.imread(str(img_path))
        if img_bgr is None:
            print(f'  skip (cannot read)')
            continue
        img_pil = Image.open(img_path).convert('RGB')

        # ── Hough ────────────────────────────────────────────────
        t0 = time.perf_counter()
        hough = hough_detect(img_bgr)
        t_hough = (time.perf_counter() - t0) * 1000

        # ── MediaPipe ────────────────────────────────────────────
        t0 = time.perf_counter()
        mp_circle, mp_label = mediapipe_detect(mp_detector, img_bgr)
        t_mp = (time.perf_counter() - t0) * 1000

        print(f'  Hough:      {hough}  ({t_hough:.0f}ms)')
        print(f'  MediaPipe:  {mp_circle}  label={mp_label}  ({t_mp:.0f}ms)')

        h_panel  = draw_result(img_pil, hough,     None,     (100, 180, 255),
                               f'Hough  |  {t_hough:.0f}ms  |  {img_path.stem}')
        mp_panel = draw_result(img_pil, mp_circle, mp_label, (100, 255, 160),
                               f'MediaPipe  |  {t_mp:.0f}ms  |  {img_path.stem}')

        rows.append((img_path.stem, h_panel, mp_panel))
        report.append(dict(
            image=img_path.name,
            hough=hough,     hough_ms=round(t_hough),
            mp=mp_circle,    mp_ms=round(t_mp),
            mp_label=mp_label,
        ))

        # Save individual comparison
        individual = Image.new('RGB', (CANVAS_W * 2, CANVAS_H))
        individual.paste(h_panel,  (0,        0))
        individual.paste(mp_panel, (CANVAS_W, 0))
        individual.save(RESULTS_DIR / f'compare_{img_path.stem}.jpg', quality=88)
        print(f'  saved: compare_{img_path.stem}.jpg')

    # ── Summary image ───────────────────────────────────────────────────
    summary = build_summary(rows)
    summary_path = RESULTS_DIR / 'detector-comparison.jpg'
    summary.save(summary_path, quality=90)
    print(f'\nSummary: {summary_path}  ({summary.size})')

    # ── Print report table ────────────────────────────────────────────
    print('\n' + '='*72)
    print(f'{"Image":<22} {"Hough":^20} {"ms":>5}  {"MediaPipe":^24} {"ms":>5}')
    print('-'*72)
    for r in report:
        hstr = f'({r["hough"][0]},{r["hough"][1]}) r={r["hough"][2]}' if r['hough'] else '—'
        mstr = r['mp_label'] or '—'
        print(f'{r["image"]:<22} {hstr:<20} {r["hough_ms"]:>5}  {mstr:<24} {r["mp_ms"]:>5}')
    print('='*72)

    # Summary stats
    h_hits  = sum(1 for r in report if r['hough'])
    mp_hits = sum(1 for r in report if r['mp'])
    total   = len(report)
    print(f'\nDetection rate:  Hough {h_hits}/{total}  |  MediaPipe {mp_hits}/{total}')
    h_avg  = sum(r['hough_ms'] for r in report) / total if total else 0
    mp_avg = sum(r['mp_ms']    for r in report) / total if total else 0
    print(f'Avg latency:     Hough {h_avg:.0f}ms  |  MediaPipe {mp_avg:.0f}ms')

if __name__ == '__main__':
    main()
