"""定时维护任务入口（docs/06 §6.4）。

用法（在 api 目录下执行）：
    python -m scripts.maintenance recount          # 重算点赞/收藏/评论数
    python -m scripts.maintenance gc --days 7      # 清分片暂存 + 孤儿文件
    python -m scripts.maintenance gc --days 7 --dry-run
"""

import argparse
import asyncio
import sys

from app.db.session import SessionLocal
from app.services import maintenance


async def run(action: str, days: int, dry_run: bool) -> int:
    async with SessionLocal() as db:
        if action == "recount":
            fixed = await maintenance.recount_counters(db)
            await db.commit()
            print(f"计数校准完成，修正 {fixed} 条")
            return 0

        staging = maintenance.purge_staging(older_than_days=days, dry_run=dry_run)
        orphans = await maintenance.purge_orphan_derived(db, dry_run=dry_run)
        originals = await maintenance.purge_orphan_originals(db, older_than_days=days, dry_run=dry_run)
        prefix = "[dry-run] 命中" if dry_run else "已清理"
        print(
            f"{prefix}：分片暂存目录 {staging} 个，孤儿派生图目录 {orphans} 个，"
            f"孤儿原始文件 {originals} 个"
        )
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="过溪畈站点维护脚本")
    parser.add_argument("action", choices=["recount", "gc"])
    parser.add_argument("--days", type=int, default=7, help="gc 时视为过期的天数")
    parser.add_argument("--dry-run", action="store_true", help="只统计不删除")
    args = parser.parse_args()
    return asyncio.run(run(args.action, args.days, args.dry_run))


if __name__ == "__main__":
    sys.exit(main())
