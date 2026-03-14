"""
build-final-image.py
比較結果にサマリー行を追加してPR用の最終画像を生成する。
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT        = Path(__file__).parent.parent
RESULTS_DIR = ROOT / 'test' / 'results'

# ── Load summary ───────────────────────────────────────────────────────────
src = Image.open(RESULTS_DIR / 'detector-comparison.jpg')
W, H = src.size

# ── Stats bar ─────────────────────────────────────────────────────────────
BAR_H = 58
final = Image.new('RGB', (W, H + BAR_H), (12, 12, 20))
final.paste(src, (0, 0))

draw = ImageDraw.Draw(final)
draw.rectangle([0, H, W, H + BAR_H], fill=(25, 25, 40))
draw.line([(0, H + 1), (W, H + 1)], fill=(60, 60, 80), width=1)

# Stats text
stats = [
    ("Hough 円変換",         "6/6 検出  |  平均 4ms",    (100, 180, 255)),
    ("MediaPipe EfficientDet","4/6 検出  |  平均 42ms",  (100, 255, 160)),
]
col_w = W // len(stats)
for i, (title, value, color) in enumerate(stats):
    x = col_w * i + 12
    draw.text((x, H + 10), title, fill=color)
    draw.text((x, H + 30), value, fill=(200, 200, 200))

# Divider
draw.line([(W // 2, H + 8), (W // 2, H + BAR_H - 8)], fill=(60, 60, 80), width=1)

# ── Resize to 50% for PR readability ──────────────────────────────────────
out = final.resize((W // 2, (H + BAR_H) // 2), Image.LANCZOS)
out_path = RESULTS_DIR / 'detector-comparison-final.jpg'
out.save(out_path, quality=90)
print(f'Saved: {out_path}  {out.size}  {out_path.stat().st_size // 1024}KB')
