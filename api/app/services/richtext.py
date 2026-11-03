"""富文本渲染：把 Tiptap JSON 渲染成白名单 HTML，避免任何脚本注入。"""

from html import escape
from urllib.parse import urlparse

MAX_DEPTH = 40

ALLOWED_SCHEMES = {"http", "https"}


def _safe_url(raw: str | None, allow_data: bool = False) -> str:
    if not raw:
        return ""
    url = str(raw).strip()
    if not url:
        return ""
    if url.startswith("/") and not url.startswith("//"):
        return escape(url, quote=True)
    if allow_data and url.startswith("data:image/"):
        return escape(url, quote=True)
    parsed = urlparse(url)
    if parsed.scheme.lower() in ALLOWED_SCHEMES:
        return escape(url, quote=True)
    return ""


def _marks(text: str, marks: list[dict]) -> str:
    out = escape(text)
    for mark in marks or []:
        kind = mark.get("type")
        if kind == "bold":
            out = f"<strong>{out}</strong>"
        elif kind == "italic":
            out = f"<em>{out}</em>"
        elif kind == "strike":
            out = f"<s>{out}</s>"
        elif kind == "underline":
            out = f"<u>{out}</u>"
        elif kind == "code":
            out = f"<code>{out}</code>"
        elif kind == "link":
            href = _safe_url((mark.get("attrs") or {}).get("href"))
            if href:
                out = f'<a href="{href}" target="_blank" rel="noopener noreferrer nofollow">{out}</a>'
    return out


def _children(node: dict, depth: int) -> str:
    return "".join(_render(child, depth + 1) for child in node.get("content") or [] if isinstance(child, dict))


def _render(node: dict, depth: int = 0) -> str:
    if depth > MAX_DEPTH:
        return ""
    kind = node.get("type")
    attrs = node.get("attrs") or {}

    if kind == "doc":
        return _children(node, depth)
    if kind == "paragraph":
        inner = _children(node, depth)
        return f"<p>{inner}</p>" if inner else "<p><br/></p>"
    if kind == "heading":
        level = int(attrs.get("level") or 2)
        level = min(max(level, 1), 4)
        return f"<h{level}>{_children(node, depth)}</h{level}>"
    if kind == "text":
        return _marks(node.get("text") or "", node.get("marks") or [])
    if kind == "hardBreak":
        return "<br/>"
    if kind == "bulletList":
        return f"<ul>{_children(node, depth)}</ul>"
    if kind == "orderedList":
        return f"<ol>{_children(node, depth)}</ol>"
    if kind == "listItem":
        return f"<li>{_children(node, depth)}</li>"
    if kind == "blockquote":
        return f"<blockquote>{_children(node, depth)}</blockquote>"
    if kind == "codeBlock":
        return f"<pre><code>{escape(_text_of(node))}</code></pre>"
    if kind == "horizontalRule":
        return "<hr/>"
    if kind == "image":
        src = _safe_url(attrs.get("src"), allow_data=True)
        if not src:
            return ""
        alt = escape(str(attrs.get("alt") or ""), quote=True)
        title = escape(str(attrs.get("title") or ""), quote=True)
        return f'<figure><img src="{src}" alt="{alt}" title="{title}" loading="lazy"/></figure>'
    return _children(node, depth)


def _text_of(node: dict) -> str:
    if node.get("type") == "text":
        return node.get("text") or ""
    return "".join(_text_of(child) for child in node.get("content") or [] if isinstance(child, dict))


def render_content(content) -> str:
    """接受 Tiptap JSON（dict）或纯文本（str），输出安全 HTML。"""
    if content is None:
        return ""
    if isinstance(content, dict):
        return _render(content)
    if isinstance(content, str):
        text = content.strip()
        if not text:
            return ""
        paragraphs = [line for line in text.split("\n") if line.strip()]
        return "".join(f"<p>{escape(line)}</p>" for line in paragraphs)
    if isinstance(content, list):
        return "".join(_render(item) for item in content if isinstance(item, dict))
    return ""


def plain_text(content, limit: int = 200) -> str:
    if content is None:
        return ""
    if isinstance(content, dict):
        text = _text_of(content)
    elif isinstance(content, list):
        text = "".join(_text_of(item) for item in content if isinstance(item, dict))
    else:
        text = str(content)
    text = " ".join(text.split())
    return text[:limit]
