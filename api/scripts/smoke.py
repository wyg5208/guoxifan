"""端到端冒烟测试：注册 → 审核 → 发帖 → 上传 → 互动 → 聊天。

用法（服务已启动）：
    python -m scripts.smoke --base http://127.0.0.1:8000
"""

import argparse
import io
import sys
import time
from pathlib import Path

import httpx
from PIL import Image

FAILS: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {name}{(' — ' + detail) if detail and not ok else ''}")
    if not ok:
        FAILS.append(name)


def body(response: httpx.Response):
    try:
        return response.json()
    except ValueError:
        return {"raw": response.text[:300]}


def main(base: str) -> int:
    client = httpx.Client(base_url=base, timeout=60.0)
    stamp = str(int(time.time()))[-6:]
    nickname = f"测试村民{stamp}"
    password = "Village2026"

    r = client.get("/healthz")
    check("健康检查", r.status_code == 200 and body(r).get("ok") is True, str(body(r)))

    r = client.get("/api/v1/site/config")
    cfg = body(r)
    check("站点配置", r.status_code == 200 and "site" in cfg.get("data", {}), str(cfg)[:200])
    site = cfg["data"]["site"]
    check("配置含站点名", bool(site.get("title")), str(site)[:120])

    r = client.get("/api/v1/home")
    home = body(r)
    check("首页聚合", r.status_code == 200 and "posts" in home.get("data", {}), str(home)[:300])
    posts = home["data"]["posts"]
    check("演示文章存在", len(posts) >= 1, f"posts={len(posts)}")
    check("演示村民存在", len(home["data"]["villagers"]) >= 1)
    check("村史时间轴存在", len(home["data"]["timeline"]) >= 1)

    # ---------------- 注册（默认人工审核）
    r = client.post(
        "/api/v1/auth/register",
        json={"email": f"tester{stamp}@village.local", "password": password, "nickname": nickname},
    )
    reg = body(r)
    check("注册成功", r.status_code == 201, str(reg)[:300])
    if r.status_code != 201:
        return 1
    check("注册后为待审核", reg["data"]["status"] == "pending", str(reg["data"]))
    user_token = reg["data"]["access_token"]
    user_headers = {"Authorization": f"Bearer {user_token}"}

    r = client.post("/api/v1/auth/login", json={"account": "admin@village.local", "password": "Village@2026"})
    admin = body(r)
    check("管理员登录", r.status_code == 200, str(admin)[:300])
    admin_headers = {"Authorization": f"Bearer {admin['data']['access_token']}"}

    r = client.get("/api/v1/admin/users", params={"status": "pending"}, headers=admin_headers)
    pending = body(r)
    check("待审核列表", r.status_code == 200 and pending["meta"]["pending_total"] >= 1, str(pending)[:200])
    target = next((u for u in pending["data"] if u["nickname"] == nickname), None)
    check("待审核里能找到新用户", target is not None)

    if target:
        r = client.post(f"/api/v1/admin/users/{target['id']}/approve", json={}, headers=admin_headers)
        check("审核通过", r.status_code == 200 and body(r)["data"]["status"] == "active", str(body(r))[:200])

    r = client.get("/api/v1/auth/me", headers=user_headers)
    me = body(r)
    check("看自己信息", r.status_code == 200, str(me)[:200])
    check("审核后具备写权限", me["data"]["permissions"]["can_write"] is True)

    # ---------------- 发文章
    content = "今天我们回老村看了一眼。\n\n槐树还在，只是巷子没了。"
    r = client.post(
        "/api/v1/posts",
        json={"kind": "article", "title": f"回村记 {stamp}", "content": content, "tags": ["老照片"]},
        headers=user_headers,
    )
    post = body(r)
    check("发布文章", r.status_code == 201, str(post)[:300])
    post_id = post["data"]["id"] if r.status_code == 201 else None
    check("文章有正文 HTML", bool(post["data"].get("content_html")), str(post)[:200])

    if post_id:
        r = client.get(f"/api/v1/posts/{post_id}")
        check("文章详情", r.status_code == 200 and body(r)["data"]["id"] == post_id)
        r = client.get("/api/v1/posts", params={"kind": "article"})
        check("文章列表", r.status_code == 200 and any(p["id"] == post_id for p in body(r)["data"]))

        r = client.post(
            "/api/v1/interactions/likes", json={"target_type": "post", "target_id": post_id}, headers=user_headers
        )
        check("点赞", r.status_code == 200 and body(r)["data"]["active"] is True, str(body(r))[:200])
        r = client.post(
            "/api/v1/interactions/likes", json={"target_type": "post", "target_id": post_id}, headers=user_headers
        )
        check("取消点赞", r.status_code == 200 and body(r)["data"]["active"] is False)

        r = client.post(
            "/api/v1/interactions/favorites",
            json={"target_type": "post", "target_id": post_id},
            headers=user_headers,
        )
        check("收藏", r.status_code == 200 and body(r)["data"]["active"] is True)

        r = client.post(
            "/api/v1/interactions/comments",
            json={"target_type": "post", "target_id": post_id, "content": "我也记得那棵树。"},
            headers=user_headers,
        )
        comment = body(r)
        check("评论", r.status_code == 201, str(comment)[:200])
        comment_id = comment["data"]["id"] if r.status_code == 201 else None

        if comment_id:
            r = client.post(
                "/api/v1/interactions/comments",
                json={"target_type": "post", "target_id": post_id, "content": "是啊。", "parent_id": comment_id},
                headers=admin_headers,
            )
            check("回复评论", r.status_code == 201, str(body(r))[:200])
            r = client.get(
                "/api/v1/interactions/comments", params={"target_type": "post", "target_id": post_id}
            )
            data = body(r)["data"]
            check("评论列表带回复", bool(data) and len(data[0]["replies"]) >= 1, str(data)[:300])
            check("评论计数", data[0]["reply_count"] >= 1, str(data[0])[:200])

    # ---------------- 上传图片
    buf = io.BytesIO()
    Image.new("RGB", (1200, 800), (180, 140, 90)).save(buf, "JPEG")
    buf.seek(0)
    r = client.post(
        "/api/v1/uploads/image",
        files={"file": ("old-house.jpg", buf.getvalue(), "image/jpeg")},
        headers=user_headers,
    )
    media = body(r)
    check("上传图片", r.status_code == 201, str(media)[:300])
    if r.status_code == 201:
        media_id = media["data"]["id"]
        check("图片已处理完成", media["data"]["status"] == "ready", str(media["data"])[:200])
        check("图片有多尺寸", "thumb" in media["data"]["urls"], str(media["data"]["urls"]))
        path = media["data"]["urls"].get("thumb")
        r = client.get(path)
        check("缩略图可访问", r.status_code == 200 and r.headers["content-type"] == "image/webp")

        r = client.get("/api/v1/media", params={"kind": "image"})
        check("图片列表", r.status_code == 200 and any(m["id"] == media_id for m in body(r)["data"]))

        r = client.get("/api/v1/uploads/quota", headers=user_headers)
        check("配额接口", r.status_code == 200 and body(r)["data"]["used_bytes"] > 0, str(body(r))[:200])

    # ---------------- 相册
    r = client.post("/api/v1/albums", json={"title": f"测试相册 {stamp}"}, headers=admin_headers)
    check("管理员建相册", r.status_code == 201, str(body(r))[:200])
    r = client.get("/api/v1/albums")
    check("相册列表", r.status_code == 200 and len(body(r)["data"]) >= 1)

    # ---------------- 村民与家庭
    r = client.get("/api/v1/families")
    families = body(r)
    check("家庭列表", r.status_code == 200 and len(families["data"]) >= 1, str(families)[:200])
    r = client.get("/api/v1/villagers")
    check("村民列表", r.status_code == 200 and len(body(r)["data"]) >= 1)
    r = client.get("/api/v1/timeline")
    check("时间轴", r.status_code == 200 and len(body(r)["data"]) >= 1)

    # ---------------- 聊天
    r = client.get("/api/v1/chat/rooms", headers=user_headers)
    rooms = body(r)
    check("会话列表（自动进大厅）", r.status_code == 200 and len(rooms["data"]) >= 1, str(rooms)[:300])
    hall = next((x for x in rooms["data"] if x["type"] == "hall"), None)
    check("大厅存在", hall is not None)

    if hall:
        r = client.post(
            f"/api/v1/chat/rooms/{hall['id']}/messages",
            json={"kind": "text", "content": "有人在家吗？"},
            headers=user_headers,
        )
        msg = body(r)
        check("发消息", r.status_code == 201, str(msg)[:300])
        check("消息序号自增", msg["data"]["seq"] >= 1, str(msg["data"])[:120])

        r = client.post(
            f"/api/v1/chat/rooms/{hall['id']}/messages",
            json={"kind": "text", "content": "在的。"},
            headers=admin_headers,
        )
        check("管理员也能进大厅说话", r.status_code == 201, str(body(r))[:200])

        r = client.get(f"/api/v1/chat/rooms/{hall['id']}/messages", headers=user_headers, params={"limit": 20})
        listing = body(r)
        check("拉取消息", r.status_code == 200 and len(listing["data"]) >= 1, str(listing)[:200])
        check("消息按时间正序", [m["seq"] for m in listing["data"]] == sorted(m["seq"] for m in listing["data"]))
        check("消息带发送者", all(m["sender"] for m in listing["data"]))

        r = client.get(f"/api/v1/chat/rooms/{hall['id']}/members", headers=user_headers)
        check("成员列表", r.status_code == 200 and len(body(r)["data"]) >= 2, str(body(r))[:200])

        last_seq = listing["data"][-1]["seq"]
        r = client.post(
            f"/api/v1/chat/rooms/{hall['id']}/read", json={"seq": last_seq}, headers=user_headers
        )
        check("标记已读", r.status_code == 200)

    # 私聊
    r = client.get("/api/v1/auth/me", headers=admin_headers)
    admin_id = body(r)["data"]["id"]
    r = client.post(f"/api/v1/chat/direct/{admin_id}", headers=user_headers)
    direct = body(r)
    check("建立私聊", r.status_code == 201, str(direct)[:200])
    if r.status_code == 201:
        room_id = direct["data"]["id"]
        check("私聊有对方信息", direct["data"]["peer"] is not None, str(direct["data"])[:200])
        r = client.post(
            f"/api/v1/chat/rooms/{room_id}/messages",
            json={"kind": "text", "content": "村长您好，我是今天注册的。"},
            headers=user_headers,
        )
        check("私聊发消息", r.status_code == 201, str(body(r))[:200])
        r = client.post(f"/api/v1/chat/direct/{admin_id}", headers=user_headers)
        check("重复私聊不新建", r.status_code == 201 and body(r)["meta"]["created"] is False, str(body(r))[:200])

    # ---------------- 聊天附件
    buf = io.BytesIO()
    Image.new("RGB", (900, 600), (60, 90, 120)).save(buf, "JPEG")
    buf.seek(0)
    r = client.post(
        "/api/v1/uploads/attachment",
        files={"file": ("chat.jpg", buf.getvalue(), "image/jpeg")},
        headers=user_headers,
    )
    att = body(r)
    check("上传聊天附件", r.status_code == 201, str(att)[:300])
    if r.status_code == 201:
        check("附件有可访问地址", bool(att["data"]["url"]), str(att["data"]))
        r = client.get(att["data"]["url"])
        check("附件可访问", r.status_code == 200)

    # ---------------- 通知
    r = client.get("/api/v1/notifications", headers=user_headers)
    check("通知列表", r.status_code == 200 and len(body(r)["data"]) >= 1, str(body(r))[:300])
    r = client.get("/api/v1/notifications/unread-count", headers=user_headers)
    check("未读数", r.status_code == 200 and body(r)["data"]["unread"] >= 1, str(body(r))[:200])
    r = client.post("/api/v1/notifications/read", json={}, headers=user_headers)
    check("全部已读", r.status_code == 200)
    r = client.get("/api/v1/notifications/unread-count", headers=user_headers)
    check("已读后为 0", body(r)["data"]["unread"] == 0, str(body(r))[:200])

    # ---------------- 搜索与后台
    r = client.get("/api/v1/search", params={"q": "村"})
    check("搜索", r.status_code == 200 and body(r)["data"]["total"] >= 1, str(body(r))[:200])

    r = client.get("/api/v1/admin/dashboard", headers=admin_headers)
    dash = body(r)
    check("后台概览", r.status_code == 200 and dash["data"]["users"] >= 2, str(dash)[:300])

    r = client.get("/api/v1/admin/settings", headers=admin_headers)
    check("后台配置读取", r.status_code == 200 and len(body(r)["data"]) >= 10, str(body(r))[:200])
    original_footer = next(
        (item["value"] for item in body(r)["data"] if item["key"] == "site.footer_text"), None
    )

    r = client.patch(
        "/api/v1/admin/settings",
        json={"items": [{"key": "site.footer_text", "value": "记住来处。"}]},
        headers=admin_headers,
    )
    check("后台配置写入", r.status_code == 200, str(body(r))[:200])
    r = client.get("/api/v1/site/config")
    check("配置对外生效", body(r)["data"]["site"]["footer_text"] == "记住来处。", str(body(r))[:200])

    # 把文案改回去，避免脏了站点
    if original_footer is not None:
        client.patch(
            "/api/v1/admin/settings",
            json={"items": [{"key": "site.footer_text", "value": original_footer}]},
            headers=admin_headers,
        )

    r = client.post(
        "/api/v1/admin/invites", json={"max_uses": 3, "auto_approve": True}, headers=admin_headers
    )
    invite = body(r)
    check("生成邀请码", r.status_code == 201 and len(invite["data"]["code"]) >= 6, str(invite)[:200])

    word = f"敏感词{stamp}"
    r = client.post(
        "/api/v1/admin/sensitive-words", json={"word": word, "level": 3}, headers=admin_headers
    )
    check("添加敏感词", r.status_code == 201, str(body(r))[:200])
    r = client.post(
        "/api/v1/posts",
        json={"kind": "short", "content": f"这里有{word}"},
        headers=user_headers,
    )
    check("敏感词拦截", r.status_code == 422 and body(r)["error"]["code"] == "CONTENT_BLOCKED", str(body(r))[:200])

    r = client.get("/api/v1/admin/audit-logs", headers=admin_headers)
    check("审计日志", r.status_code == 200 and len(body(r)["data"]) >= 1, str(body(r))[:200])

    r = client.get("/api/v1/admin/storage", headers=admin_headers)
    check("存储用量", r.status_code == 200 and body(r)["data"]["total_bytes"] > 0, str(body(r))[:200])

    # ---------------- 权限
    r = client.get("/api/v1/admin/dashboard", headers=user_headers)
    check("普通用户进不了后台", r.status_code == 403, str(r.status_code))

    r = client.get("/api/v1/auth/me")
    check("未登录访问受限", r.status_code == 401, str(r.status_code))

    print()
    if FAILS:
        print(f"失败 {len(FAILS)} 项：{', '.join(FAILS)}")
        return 1
    print("全部通过")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    sys.exit(main(args.base))
