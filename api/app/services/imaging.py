"""图片处理：方向纠正、多尺寸 WebP、EXIF 拍摄时间、剥离隐私信息。"""

import json
import logging
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageOps

logger = logging.getLogger(__name__)

Image.MAX_IMAGE_PIXELS = 220_000_000

SIZES = {"thumb": 400, "small": 900, "medium": 1600}
ORIGINAL_MAX = 3000
WEBP_QUALITY = 82


def _exif_taken_at(image: Image.Image) -> datetime | None:
    try:
        exif = image.getexif()
        raw = exif.get(36867) or exif.get(306)  # DateTimeOriginal / DateTime
    except Exception:  # noqa: BLE001 - EXIF 结构千奇百怪
        return None
    if not raw:
        return None
    text = str(raw).strip().replace("\x00", "")
    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y:%m:%d"):
        try:
            return datetime.strptime(text[: len(fmt) + 2].strip(), fmt)
        except ValueError:
            continue
    return None


def _flatten(image: Image.Image) -> Image.Image:
    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        return image.convert("RGBA")
    return image.convert("RGB")


def process_image(source: Path, out_dir: Path) -> dict:
    """同步执行（调用方用 asyncio.to_thread 包一层）。返回元信息。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as raw:
        image = ImageOps.exif_transpose(raw)
        image.load()
        taken_at = _exif_taken_at(raw)
        base = _flatten(image)

        width, height = base.size
        variants: dict[str, str] = {}

        for name, limit in SIZES.items():
            copy = base.copy()
            copy.thumbnail((limit, limit), Image.Resampling.LANCZOS)
            target = out_dir / f"{name}.webp"
            copy.save(target, "WEBP", quality=WEBP_QUALITY, method=4)
            variants[name] = target.name

        original = base.copy()
        if max(original.size) > ORIGINAL_MAX:
            original.thumbnail((ORIGINAL_MAX, ORIGINAL_MAX), Image.Resampling.LANCZOS)
        original.save(out_dir / "original.webp", "WEBP", quality=88, method=3)
        variants["original"] = "original.webp"

        # 小尺寸 base64 占位图（LQIP），避免首屏空白
        tiny = base.copy()
        tiny.thumbnail((24, 24), Image.Resampling.LANCZOS)
        lqip_path = out_dir / "lqip.webp"
        tiny.save(lqip_path, "WEBP", quality=40, method=2)
        variants["lqip"] = "lqip.webp"

    return {
        "width": width,
        "height": height,
        "taken_at": taken_at.isoformat() if taken_at else None,
        "variants": variants,
        "meta": json.dumps({"sizes": list(SIZES), "quality": WEBP_QUALITY}, ensure_ascii=False),
    }
