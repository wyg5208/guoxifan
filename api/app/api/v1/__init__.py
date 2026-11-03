"""v1 路由聚合。"""

from fastapi import APIRouter

from app.api.v1 import (
    admin,
    auth,
    chat,
    content,
    feed,
    interactions,
    notifications,
    site,
    uploads,
    village,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(site.router)
api_router.include_router(auth.router)
api_router.include_router(feed.router)
api_router.include_router(content.router)
api_router.include_router(village.router)
api_router.include_router(uploads.router)
api_router.include_router(interactions.router)
api_router.include_router(chat.router)
api_router.include_router(notifications.router)
api_router.include_router(admin.router)

__all__ = ["api_router"]
