"""站点公开配置与统计。"""

from fastapi import APIRouter

from app.core.deps import DbSession
from app.services import settings as site_settings
from app.services.stats import compute_stats

router = APIRouter(tags=["站点"])


@router.get("/site/config")
async def site_config(db: DbSession):
    return {"data": await site_settings.get_public_config(db)}


@router.get("/site/stats")
async def site_stats(db: DbSession):
    return {"data": await compute_stats(db)}
