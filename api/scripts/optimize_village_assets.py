"""把 docs/assets/village 下的生成稿压成站点可用的 WebP 多尺寸。

用法：python -m scripts.optimize_village_assets
输出：docs/assets/village/web/<name>-{1920,1280,640}.webp
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

SRC = Path(__file__).resolve().parents[2] / "docs" / "assets" / "village"
DST = SRC / "web"
WIDTHS = (1920, 1280, 640)
QUALITY = 82


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    for path in sorted(SRC.glob("*.png")):
        with Image.open(path) as img:
            img = img.convert("RGB")
            for width in WIDTHS:
                if img.width < width and width != WIDTHS[-1]:
                    continue
                ratio = min(1.0, width / img.width)
                resized = img.resize((int(img.width * ratio), int(img.height * ratio)), Image.LANCZOS)
                out = DST / f"{path.stem}-{width}.webp"
                resized.save(out, "WEBP", quality=QUALITY, method=6)
                print(f"{out.relative_to(SRC.parent.parent)}  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
