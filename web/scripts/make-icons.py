"""生成 PWA 图标：纸底 + 朱印「畈」。

设计依据 docs/08-站点文案与视觉素材.md 的 Logo 规范：
衬线字「过溪畈」右侧一枚褪色红印，印内白字「畈」。应用图标取印章本身。

用法（仓库根目录）：
    .venv/Scripts/python.exe web/scripts/make-icons.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PAPER = (245, 239, 228, 255)
SEAL = (168, 50, 58, 255)
GLYPH = (245, 239, 228, 255)
CLAY = (180, 121, 63, 255)

OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "icons"
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\simsun.ttc",
    r"C:\Windows\Fonts\STSONG.TTF",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\msyh.ttc",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default(size)


def build(size: int, *, rounded: bool, bleed: bool) -> Image.Image:
    """按 4 倍超采样绘制后缩小，边缘更干净。"""
    scale = 4
    canvas = size * scale
    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    if rounded:
        draw.rounded_rectangle((0, 0, canvas, canvas), radius=int(canvas * 0.22), fill=PAPER)
    else:
        draw.rectangle((0, 0, canvas, canvas), fill=PAPER)

    # 印章：留出安全区，maskable 也不会被裁掉
    seal_ratio = 0.66 if bleed else 0.70
    seal_side = int(canvas * seal_ratio)
    left = (canvas - seal_side) // 2
    top = (canvas - seal_side) // 2
    radius = int(seal_side * 0.08)
    draw.rounded_rectangle(
        (left, top, left + seal_side, top + seal_side),
        radius=radius,
        fill=SEAL,
    )

    # 印内白字「畈」
    font = load_font(int(seal_side * 0.66))
    box = draw.textbbox((0, 0), "畈", font=font)
    text_w = box[2] - box[0]
    text_h = box[3] - box[1]
    draw.text(
        (left + (seal_side - text_w) / 2 - box[0], top + (seal_side - text_h) / 2 - box[1]),
        "畈",
        font=font,
        fill=GLYPH,
    )

    # 印下一条瘦长的溪水线，呼应「过了溪，就是田畈」
    line_y = top + seal_side + int(canvas * 0.055)
    line_w = int(seal_side * 0.62)
    line_x = (canvas - line_w) // 2
    draw.rounded_rectangle(
        (line_x, line_y, line_x + line_w, line_y + max(2, int(canvas * 0.012))),
        radius=int(canvas * 0.008),
        fill=CLAY,
    )

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    build(512, rounded=False, bleed=True).save(OUT_DIR / "icon-512.png")
    build(192, rounded=False, bleed=True).save(OUT_DIR / "icon-192.png")
    build(180, rounded=False, bleed=True).save(OUT_DIR / "apple-touch-icon.png")

    # 桌面 favicon：带圆角，透明四角
    build(256, rounded=True, bleed=False).save(OUT_DIR / "icon-256.png")

    for path in sorted(OUT_DIR.glob("*.png")):
        print(f"{path.name}: {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
