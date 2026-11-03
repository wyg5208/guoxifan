"""初始化数据。

    python -m scripts.seed           # 只建表和默认配置 + 管理员
    python -m scripts.seed --demo    # 额外写入一份演示数据
"""

import argparse
import asyncio
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.constants import MEDIA_READY, ROLE_MEMBER, USER_ACTIVE  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal, init_db  # noqa: E402
from app.models.content import Album, Media, Post, PostTag, Tag  # noqa: E402
from app.models.user import User  # noqa: E402
from app.models.village import Family, TimelineEvent, Villager  # noqa: E402
from app.services import storage  # noqa: E402
from app.services.imaging import process_image  # noqa: E402
from app.services.richtext import plain_text, render_content  # noqa: E402
from app.services.settings import ensure_seed  # noqa: E402

# 演示用的村民账号（密码与管理员默认密码一致）。绑在在世的村民身上，
# 「已故」的村民不应该有能私信的账号。
DEMO_MEMBER = {
    "email": "villager@village.local",
    "password": "Village@2026",
    "nickname": "张卫东",
    "villager": "张卫东",
}

# 预置的村庄照片在前端仓库里，演示相册直接拿它们跑一遍图片流水线
PHOTO_DIRS = [
    Path(__file__).resolve().parents[2] / "web" / "public" / "assets" / "village",
    Path(__file__).resolve().parents[1] / "web" / "public" / "assets" / "village",
]

DEMO_ALBUMS = [
    {
        "title": "翁梅溪 · 桥 · 埠头",
        "era": "1980-2026",
        "description": "洗菜洗衣的埠头，过溪的石板桥。",
        "photos": [
            ("hero-02-stream-1280.webp", "翁梅溪", "溪从村东头绕过来，夏天孩子们就在这一截水里泡着。"),
            ("site-old-camphor-1280.webp", "溪边的老樟树", "树比村里最老的人还老，拆迁时被单独留了下来。"),
        ],
    },
    {
        "title": "田畈上的四季",
        "era": "1970-2020",
        "description": "插秧、双抢、晒谷、稻草人，一年到头的活计。",
        "photos": [
            ("photo-1980s-threshing-1280.webp", "打谷场", "双抢时节，全队的人都在晒场上，天黑才收工。"),
            ("hero-01-panorama-1280.webp", "田畈全景", "过了溪就是田畈，村子这个名字就是这么来的。"),
        ],
    },
    {
        "title": "门牌与春联",
        "era": "2025-2026",
        "description": "拆迁前最后一年，一家一家拍下来的门。",
        "photos": [
            ("photo-doorplate-1280.webp", "最后一年贴的春联", "门牌还在，门里的人已经搬去了安置小区。"),
            ("hero-03-lane-1280.webp", "巷口", "两堵墙只隔一条巷子，端着饭碗能串半条村。"),
        ],
    },
    {
        "title": "院子里的人",
        "era": "1985-1995",
        "description": "堂前、门槛、竹椅，人坐着的地方才是家。",
        "photos": [
            ("photo-1990s-family-1280.webp", "九十年代的全家福", "在堂前拍的，背景里那台缝纫机还在。"),
            ("portrait-elder-640.webp", "坐在门槛上的阿婆", "门槛被坐得发亮，比椅子还亲切。"),
        ],
    },
]

DEMO_SHORTS = [
    ("今天去看，推土机已经进了三队。王家的石榴树还在，没人敢先动它。", 1),
    ("妈说她小时候就在这个埠头洗菜，水清得能看见鱼。", 0),
    ("翻出一张八十年代晒场的照片，背后写着「双抢结束，全队合影」。", 2),
    ("门牌一块块取下来，我把自家的最后一张拍了下来。", 4),
    ("还能记得村口那棵樟树多少年了吗？老人说比村子还老。", 6),
    ("搬进安置小区第三天，夜里还是听得见水声——其实是楼下空调外机。", None),
]

FAMILIES = [
    {
        "name": "王家老屋",
        "householder": "王德福",
        "village_area": "过溪畈 三队",
        "door_no": "三队 12 号",
        "address_text": "翁梅溪东岸，门口有三级青石阶",
        "intro": "土坯墙、青瓦顶，院子里有一棵百年石榴。",
        "relocated_at": "2026",
        "current_loc": "白云街道安置小区",
        "sort_order": 1,
    },
    {
        "name": "李家染坊",
        "householder": "李长顺",
        "village_area": "官庄畈",
        "door_no": "官庄畈 7 号",
        "address_text": "官庄畈拐角，门前有个晒布的高架子",
        "intro": "祖上三代做染布，蓝靛草的味道一进巷子就闻得到。",
        "relocated_at": "2026",
        "current_loc": "市区",
        "sort_order": 2,
    },
    {
        "name": "张家粉坊",
        "householder": "张守义",
        "village_area": "蓬上",
        "door_no": "蓬上 2 号",
        "address_text": "蓬上井台边，门口两只大石磨",
        "intro": "冬天做粉条，全村人都来排队。",
        "relocated_at": "2026",
        "current_loc": "镇上安置房",
        "sort_order": 3,
    },
    {
        "name": "村小学",
        "householder": None,
        "village_area": "过溪畈 中街",
        "door_no": "中 1 号",
        "address_text": "中街最北头，两间瓦房加一个小操场",
        "intro": "最多的时候有四十多个学生，一个老师教四个年级。",
        "relocated_at": "2006-09",
        "current_loc": "已并入中心学校",
        "sort_order": 4,
    },
]

VILLAGERS = [
    ("王德福", "王家老屋", "本人", "male", "德字辈", "1938", "木匠，会打寿材", True),
    ("王秀兰", "王家老屋", "妻", "female", "德字辈", "1942", "织布、做鞋", True),
    ("王建国", "王家老屋", "长子", "male", "建字辈", "1965", "跑运输，1998 年买了村里第一台拖拉机", False),
    ("王建军", "王家老屋", "次子", "male", "建字辈", "1969", "在城里开修车铺", False),
    ("李长顺", "李家染坊", "本人", "male", "长字辈", "1945", "染匠，最后一代", True),
    ("李桂英", "李家染坊", "妻", "female", "长字辈", "1949", "做豆腐的手艺全村有名", True),
    ("李红梅", "李家染坊", "长女", "female", "红字辈", "1972", "考出去的第一个大学生", False),
    ("张守义", "张家粉坊", "本人", "male", "守字辈", "1940", "粉匠，冬天做粉条", True),
    ("张卫东", "张家粉坊", "长子", "male", "卫字辈", "1968", "现在在镇上开超市", False),
    ("赵玉珍", "张守义家", "儿媳", "female", "卫字辈", "1970", "照顾老人，记性最好", False),
]


async def _seed_photo(
    db, uploader_id: str, album: Album, photo_dir: Path, era: str, filename: str, title: str, caption: str
) -> Media | None:
    """把仓库里的预置照片跑一遍真实图片流水线，存成一张可用的 Media。"""
    source = photo_dir / filename
    if not source.exists():
        return None
    key = storage.new_storage_key("image", ".webp")
    dest = storage.safe_path(key)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, dest)

    media = Media(
        album_id=album.id,
        kind="image",
        title=title,
        caption=caption,
        era=era,
        status="processing",
        mime="image/webp",
        ext=".webp",
        size_bytes=dest.stat().st_size,
        storage_key=key,
        visibility="public",
        uploader_id=uploader_id,
    )
    db.add(media)
    await db.flush()

    info = await asyncio.to_thread(process_image, dest, storage.derived_dir(media.id))
    media.width = info["width"]
    media.height = info["height"]
    media.derived = json.dumps(info["variants"], ensure_ascii=False)
    media.status = MEDIA_READY
    return media


async def seed_demo(db, admin: User) -> None:
    existing = (await db.execute(select(Family.id).limit(1))).scalar_one_or_none()
    if existing is not None:
        print("已存在数据，跳过演示数据")
        return

    families: dict[str, Family] = {}
    for item in FAMILIES:
        family = Family(**item)
        db.add(family)
        await db.flush()
        families[family.name] = family
    families["张守义家"] = families["张家粉坊"]

    # 一位绑定了账号的村民：用来演示「村民之间私聊」这条链路
    member = User(
        email=DEMO_MEMBER["email"],
        password_hash=hash_password(DEMO_MEMBER["password"]),
        nickname=DEMO_MEMBER["nickname"],
        role=ROLE_MEMBER,
        status=USER_ACTIVE,
    )
    db.add(member)
    await db.flush()

    for name, family_name, relation, gender, generation, birth, intro, deceased in VILLAGERS:
        family = families.get(family_name)
        villager = Villager(
            name=name,
            family_id=family.id if family else None,
            relation_to_head=relation,
            gender=gender,
            generation=generation,
            birth_date=birth,
            is_deceased=1 if deceased else 0,
            occupation=None,
            intro=intro,
            contact_visibility="member",
            user_id=member.id if name == DEMO_MEMBER["villager"] else None,
        )
        db.add(villager)
        await db.flush()
        if name == DEMO_MEMBER["villager"]:
            member.villager_id = villager.id

    events = [
        ("1948", 1948, "石梁乡第九保", "那一年，过溪畈还是石梁乡下面的第九保。"),
        ("1950", 1950, "划入翁梅村", "归到柴家乡翁梅村；村名里那条溪，就叫翁梅溪。"),
        ("1956", 1956, "后翁高级社", "几户人家并成一个社，田连成片，牛也合着用。"),
        ("1984", 1984, "改行政村", "隶姜家山乡，村委挂牌，一直到今天。"),
        ("2003", 2003, "划入城区街道", "从姜家山乡划出，进了城区的建制，田开始一亩亩变少。"),
        ("2025", 2025, "杭衢高铁开通", "杭州西到衢州西 73 分钟，衢州西站就在姜家山。"),
        ("2026", 2026, "启动拆迁", "轮到房子了。从这一年起，村子只在这个网站上。"),
    ]
    for label, year, title, description in events:
        db.add(
            TimelineEvent(
                year_label=label,
                sort_year=year,
                title=title,
                description=description,
                category="村史",
            )
        )

    photo_dir = next((path for path in PHOTO_DIRS if path.is_dir()), None)
    photo_total = 0
    photos: list[Media] = []
    for spec in DEMO_ALBUMS:
        album = Album(
            title=spec["title"],
            era=spec["era"],
            description=spec["description"],
            visibility="public",
            created_by=admin.id,
        )
        db.add(album)
        await db.flush()

        if photo_dir is None:
            continue
        in_album = 0
        for filename, title, caption in spec["photos"]:
            media = await _seed_photo(db, admin.id, album, photo_dir, spec["era"], filename, title, caption)
            if media is None:
                continue
            in_album += 1
            photo_total += 1
            photos.append(media)
            if album.cover_url is None:
                album.cover_url = f"/media/derived/{media.id}/thumb.webp"
        album.media_count = in_album

    # 短文：首屏「有人刚开口」那一段不能空着
    for content, photo_index in DEMO_SHORTS:
        images = []
        if photo_index is not None and photo_index < len(photos):
            images = [f"/media/derived/{photos[photo_index].id}/medium.webp"]
        db.add(
            Post(
                kind="short",
                summary=plain_text(content, 120),
                content=content,
                content_html=render_content(content),
                images=json.dumps(images, ensure_ascii=False),
                cover_url=images[0] if images else None,
                author_id=admin.id,
                category="随记",
                status="published",
                visibility="public",
            )
        )

    body = """很多人问我，一个要拆的村子，还留个网站做什么。

我想了很久，大概是这个意思：村名是从一条小溪来的——过了溪，就是一片田畈。以后田畈上要长楼，孩子只知道这里曾经有个村子，却不知道翁梅溪的水从哪里来，不知道谁家在门口种了柿子树，不知道夏天晚上大家都搬着小凳坐在巷口。

这里就是给这些事留个地方。

你可以把家里的老照片传上来，写几句当时的情形；可以在这里找到你的老邻居；也可以在聊天室里，像从前一样，随便说两句。

房子会拆，记着它的人还在。
"""
    post = Post(
        kind="article",
        title="写在前面：为什么要给村子建一个网站",
        summary=plain_text(body, 140),
        content=body,
        content_html=render_content(body),
        author_id=admin.id,
        category="随笔",
        status="published",
        visibility="public",
        is_pinned=1,
        published_at=None,
    )
    db.add(post)
    await db.flush()

    for name in ("村史", "老照片", "翁梅溪"):
        tag = (await db.execute(select(Tag).where(Tag.name == name))).scalar_one_or_none()
        if tag is None:
            tag = Tag(name=name, slug=name, use_count=0)
            db.add(tag)
            await db.flush()
        tag.use_count += 1
        db.add(PostTag(post_id=post.id, tag_id=tag.id))

    await db.commit()
    print(
        f"演示数据写入完成：{len(FAMILIES)} 个家庭、{len(VILLAGERS)} 位村民、{len(events)} 条村史、"
        f"{len(DEMO_ALBUMS)} 个相册、{photo_total} 张照片、{len(DEMO_SHORTS)} 条短文"
    )
    print(f"演示村民账号：{DEMO_MEMBER['email']} / {DEMO_MEMBER['password']}（昵称 {DEMO_MEMBER['nickname']}）")


async def main(demo: bool) -> None:
    settings.ensure_dirs()
    await init_db()
    async with SessionLocal() as db:
        await ensure_seed(
            db,
            settings.admin_init_email,
            settings.admin_init_password,
            settings.admin_init_nickname,
        )
        admin = (
            await db.execute(select(User).where(User.role == "super_admin").order_by(User.id).limit(1))
        ).scalar_one_or_none()
        if admin is None:
            raise SystemExit("未找到超级管理员，请检查 .env 中的 ADMIN_INIT_* 配置")
        print(f"超级管理员：{admin.email or admin.nickname}")
        if demo:
            await seed_demo(db, admin)
    print("初始化完成。")
    print(json.dumps({"database": settings.database_url, "media": str(settings.media_path)}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="过溪畈 · 老村记忆 · 数据初始化")
    parser.add_argument("--demo", action="store_true", help="写入演示数据（家庭/村民/村史/相册/文章/短文）")
    args = parser.parse_args()
    asyncio.run(main(args.demo))
