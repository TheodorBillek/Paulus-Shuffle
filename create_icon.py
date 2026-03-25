"""
create_icon.py — Generates icon.png and icon.ico for Paulus Shuffle.
Run once before building the executable:  python create_icon.py
"""

from PIL import Image, ImageDraw
import math

SIZE = 512
BG   = (15, 23, 42, 255)    # #0f172a  (dark navy)
FG   = (56, 189, 248, 255)  # #38bdf8  (sky blue accent)


def bezier(p0, p1, p2, steps=40):
    """Quadratic bezier point list from p0 through control p1 to p2."""
    points = []
    for i in range(steps + 1):
        t  = i / steps
        mt = 1 - t
        x  = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0]
        y  = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]
        points.append((x, y))
    return points


def draw_arrow(draw, points, lw, fg):
    """Draw a polyline arrow along the given points list."""
    for i in range(len(points) - 1):
        draw.line([points[i], points[i + 1]], fill=fg, width=lw)


def arrowhead(draw, tip, prev, size, fg):
    """Draw a filled arrowhead at `tip` pointing away from `prev`."""
    dx = tip[0] - prev[0]
    dy = tip[1] - prev[1]
    length = math.hypot(dx, dy) or 1
    ux, uy = dx / length, dy / length          # unit vector forward
    px, py = -uy, ux                            # perpendicular

    s = size
    w = s * 0.45
    b1 = (tip[0] - ux * s + px * w, tip[1] - uy * s + py * w)
    b2 = (tip[0] - ux * s - px * w, tip[1] - uy * s - py * w)
    draw.polygon([tip, b1, b2], fill=fg)


def create_icon(size=SIZE):
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded square background
    pad = int(size * 0.04)
    r   = int(size * 0.20)
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=r, fill=BG)

    lw = int(size * 0.058)
    ah = int(size * 0.10)

    s = size

    # ── Arrow 1: left-middle → curves down → right-bottom ─────────────────────
    a_start  = (int(s * 0.14), int(s * 0.34))
    a_mid    = (int(s * 0.44), int(s * 0.34))
    ctrl1    = (int(s * 0.64), int(s * 0.34))
    a_end    = (int(s * 0.82), int(s * 0.66))

    seg1 = [(a_start[0] + i, a_start[1]) for i in range(0, a_mid[0] - a_start[0], 2)]
    seg1.append(a_mid)
    seg2 = bezier(a_mid, ctrl1, a_end, steps=50)

    draw_arrow(draw, seg1, lw, FG)
    draw_arrow(draw, seg2, lw, FG)
    arrowhead(draw, a_end, seg2[-2], ah, FG)

    # ── Arrow 2: left-middle → curves up → right-top ──────────────────────────
    b_start  = (int(s * 0.14), int(s * 0.66))
    b_mid    = (int(s * 0.44), int(s * 0.66))
    ctrl2    = (int(s * 0.64), int(s * 0.66))
    b_end    = (int(s * 0.82), int(s * 0.34))

    seg3 = [(b_start[0] + i, b_start[1]) for i in range(0, b_mid[0] - b_start[0], 2)]
    seg3.append(b_mid)
    seg4 = bezier(b_mid, ctrl2, b_end, steps=50)

    draw_arrow(draw, seg3, lw, FG)
    draw_arrow(draw, seg4, lw, FG)
    arrowhead(draw, b_end, seg4[-2], ah, FG)

    return img


if __name__ == "__main__":
    icon = create_icon()
    icon.save("icon.png")

    ico_sizes = [16, 32, 48, 64, 128, 256]
    resized   = [icon.resize((s, s), Image.LANCZOS) for s in ico_sizes]
    resized[0].save(
        "icon.ico",
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=resized[1:],
    )

    print("Created icon.png and icon.ico")
