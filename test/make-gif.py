"""
make-gif.py  —  桜投影アニメーションのGIFを生成する。
PIL/Pillow で茶碗画像の上に桜花びらをアニメーション描画する。

Usage: python3 test/make-gif.py
Output: test/results/sakura-demo.gif
"""

import os, math, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT   = Path(__file__).parent.parent
ASSETS = ROOT / 'test' / 'assets' / 'test-bowl.jpg'
OUT    = ROOT / 'test' / 'results' / 'sakura-demo.gif'
OUT.parent.mkdir(parents=True, exist_ok=True)

# ── Canvas settings ────────────────────────────────────────────────────────
W, H  = 640, 480
FPS   = 12
TOTAL = 7.0     # seconds
SCATTER_START = 3.0
SCATTER_END   = 5.8

# ── Cup position (centred on the matcha bowl in the image) ─────────────────
CUP = dict(x=320, y=265, r=125)

# ── Particle system ────────────────────────────────────────────────────────
N = 80   # number of petals
random.seed(42)

class Petal:
    def __init__(self, i):
        self.seed   = i / N
        # position within unit disk (uniform distribution)
        ang         = random.uniform(0, 2 * math.pi)
        rad         = math.sqrt(random.random())
        self.ux     = math.cos(ang) * rad  # unit-disk x
        self.uy     = math.sin(ang) * rad  # unit-disk y
        self.speed  = 0.12 + random.random() * 0.22
        self.size   = 9 + random.random() * 11
        self.phase  = random.uniform(0, 2 * math.pi)
        self.dfreq  = 0.35 + random.random() * 0.55
        self.sc_ang = random.uniform(0, 2 * math.pi)
        # Petal rotation visual offset
        self.rot_off = random.uniform(0, 2 * math.pi)
        # Colour: random in sakura range
        r_ = int(245 + random.random() * 10)
        g_ = int(155 + random.random() * 30)
        b_ = int(175 + random.random() * 25)
        self.color = (r_, g_, b_)

    def pos(self, t, scatter):
        """Return (wx, wy, alpha, size, rot) at time t."""
        # floating animation
        lx = self.ux + math.sin(t * self.dfreq + self.phase) * 0.18
        ly = self.uy + math.cos(t * self.dfreq * 0.73 + self.phase * 1.3) * 0.11
        ly -= math.sin(t * self.speed + self.phase) * 0.10

        # world position
        wx = CUP['x'] + lx * CUP['r']
        wy = CUP['y'] + ly * CUP['r']

        # scatter
        s = scatter * scatter
        wx += math.cos(self.sc_ang) * CUP['r'] * 3.0 * scatter
        wy += math.sin(self.sc_ang) * CUP['r'] * 3.0 * scatter
        wy += 180.0 * s

        # alpha
        shimmer = 0.55 + 0.45 * math.sin(t * self.speed * 2.8 + self.phase)
        alpha   = shimmer * (1.0 - scatter * 0.85)

        size    = self.size * (1.0 + scatter * 0.4)
        rot     = t * self.speed * 0.9 + self.phase + self.rot_off
        return wx, wy, alpha, size, rot

petals = [Petal(i) for i in range(N)]

def draw_petal(draw: ImageDraw.Draw, cx, cy, size, rot, color, alpha_f):
    """Draw a single 5-petal sakura flower at (cx, cy)."""
    if alpha_f < 0.02:
        return

    PETALS = 5
    petal_r = size * 0.38   # petal semi-major
    petal_d = size * 0.35   # distance of petal centre from flower centre
    stretch = 1.55           # elongation ratio

    for k in range(PETALS):
        angle   = rot + k * (2 * math.pi / PETALS)
        # petal centre
        pcx = cx + math.cos(angle) * petal_d
        pcy = cy + math.sin(angle) * petal_d
        # petal orientation (90° offset so long axis points outward)
        pang = angle + math.pi / 2

        # Draw petal as a small ellipse rotated about pcx, pcy
        a = petal_r          # semi-axis along orientation
        b = petal_r / stretch

        # Build rotated ellipse points
        pts = []
        for step in range(16):
            th = step * (2 * math.pi / 16)
            ex = math.cos(th) * a
            ey = math.sin(th) * b
            rx = ex * math.cos(pang) - ey * math.sin(pang)
            ry = ex * math.sin(pang) + ey * math.cos(pang)
            pts.append((pcx + rx, pcy + ry))

        # Create a temporary image to draw with alpha
        a_val = max(0, min(255, int(alpha_f * 200)))
        fill  = color + (a_val,)
        draw.polygon(pts, fill=fill)

    # Centre circle
    cr = size * 0.10
    a_val = max(0, min(255, int(alpha_f * 220)))
    cx2, cy2 = color[0], color[1]
    centre_col = (min(255, cx2 - 20), cy2, color[2], a_val)
    draw.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=centre_col)


def render_frame(bg: Image.Image, t: float, fade_in: float, scatter: float) -> Image.Image:
    """Render one frame: background + petals."""
    # Base: camera image (the tea bowl)
    frame = bg.copy().convert('RGBA')

    # Petal layer (RGBA, transparent)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw  = ImageDraw.Draw(layer, 'RGBA')

    for p in petals:
        wx, wy, alpha, size, rot = p.pos(t, scatter)
        draw_petal(draw, wx, wy, size, rot, p.color, alpha * fade_in)

    # Cup indicator circle (thin dashed-like ring)
    ring_alpha = int(fade_in * 80)
    if ring_alpha > 5:
        cx, cy, r = CUP['x'], CUP['y'], CUP['r']
        ring_layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        rd = ImageDraw.Draw(ring_layer, 'RGBA')
        # Draw as thin ring
        for seg in range(24):
            a0 = seg / 24 * 2 * math.pi
            a1 = (seg + 0.6) / 24 * 2 * math.pi
            pts = [(cx + r * math.cos(a0), cy + r * math.sin(a0)),
                   (cx + r * math.cos(a1), cy + r * math.sin(a1))]
            rd.line(pts, fill=(255, 183, 197, ring_alpha), width=2)
        layer = Image.alpha_composite(ring_layer, layer)

    # Composite petal layer onto frame
    frame = Image.alpha_composite(frame, layer)
    return frame.convert('RGB')


def main():
    # Load and resize background image
    bg_orig = Image.open(ASSETS).convert('RGBA')
    bg = bg_orig.resize((W, H), Image.LANCZOS)

    frames    = []
    durations = []

    n_frames  = int(TOTAL * FPS)
    for i in range(n_frames):
        t = i / FPS

        # Fade in
        fade_in = min(1.0, t / 0.8)

        # Scatter
        scatter = 0.0
        if SCATTER_START <= t < SCATTER_END:
            scatter = min(1.0, (t - SCATTER_START) / (SCATTER_END - SCATTER_START))
        elif t >= SCATTER_END:
            # Re-appear after scatter
            fade_in = min(1.0, (t - SCATTER_END) / 0.8)
            scatter = 0.0

        frame = render_frame(bg, t, fade_in, scatter)

        # Add label
        # (skip for cleaner look)

        frames.append(frame)
        durations.append(int(1000 / FPS))
        if i % FPS == 0:
            print(f'  t={t:.1f}s  scatter={scatter:.2f}  fade={fade_in:.2f}')

    # Save as GIF
    print(f'\nSaving GIF → {OUT}')
    # Quantize for GIF
    palette_frames = [f.quantize(colors=128, method=Image.Quantize.MEDIANCUT) for f in frames]
    palette_frames[0].save(
        OUT,
        save_all=True,
        append_images=palette_frames[1:],
        duration=durations,
        loop=0,
        optimize=True,
    )
    size_kb = OUT.stat().st_size // 1024
    print(f'Done! {len(frames)} frames, {size_kb} KB → {OUT}')

if __name__ == '__main__':
    main()
