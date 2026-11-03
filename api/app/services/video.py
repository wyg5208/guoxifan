"""视频处理：HLS 转码 + 首帧封面；ffmpeg 不可用时降级为原文件直出。"""

import asyncio
import logging
import shutil
import sys
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)

CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0


async def _run(cmd: list[str], timeout: int = 1800) -> None:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
        creationflags=CREATE_NO_WINDOW,
    )
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError("ffmpeg 超时")
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg 失败: {stderr.decode('utf-8', 'ignore')[:500]}")


def _playlist_height() -> str:
    return "720"


def _fallback(source: Path, out_dir: Path) -> dict:
    target = out_dir / "source.mp4"
    shutil.copyfile(source, target)
    return {"hls": None, "poster": None, "fallback": "source.mp4"}


async def process_video(source: Path, out_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    if not settings.video_transcode_enabled:
        return _fallback(source, out_dir)

    ffmpeg = settings.ffmpeg_path
    playlist = out_dir / "index.m3u8"
    poster = out_dir / "poster.jpg"
    try:
        await _run(
            [
                ffmpeg, "-y", "-i", str(source),
                "-vf", f"scale=-2:{_playlist_height()}",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
                "-c:a", "aac", "-b:a", "128k",
                "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
                str(playlist),
            ]
        )
        await _run([ffmpeg, "-y", "-ss", "1", "-i", str(source), "-vframes", "1", "-vf", "scale=640:-2", str(poster)])
        return {"hls": "index.m3u8", "poster": "poster.jpg", "fallback": None}
    except Exception as exc:  # noqa: BLE001 - 转码失败不应阻塞上传
        logger.warning("视频转码失败，降级为原文件: %s", exc)
        return _fallback(source, out_dir)
