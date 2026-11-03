"""全局枚举与常量。数据库中统一存字符串，便于加值不改表。"""

# 角色（权限由高到低）
ROLE_SUPER_ADMIN = "super_admin"
ROLE_ADMIN = "admin"
ROLE_EDITOR = "editor"
ROLE_MEMBER = "member"
ROLES = (ROLE_SUPER_ADMIN, ROLE_ADMIN, ROLE_EDITOR, ROLE_MEMBER)

ROLE_RANK = {ROLE_MEMBER: 10, ROLE_EDITOR: 20, ROLE_ADMIN: 30, ROLE_SUPER_ADMIN: 40}

# 账号状态
USER_PENDING = "pending"
USER_ACTIVE = "active"
USER_DISABLED = "disabled"

# 注册模式
REG_OPEN = "open"
REG_INVITE = "invite"
REG_CLOSED = "closed"

# 内容类型
POST_ARTICLE = "article"
POST_SHORT = "short"
POST_DRAFT = "draft"
POST_PENDING = "pending"
POST_PUBLISHED = "published"
POST_ARCHIVED = "archived"

MEDIA_IMAGE = "image"
MEDIA_VIDEO = "video"
MEDIA_PROCESSING = "processing"
MEDIA_READY = "ready"
MEDIA_FAILED = "failed"

VIS_PUBLIC = "public"
VIS_MEMBER = "member"

# 聊天
ROOM_HALL = "hall"
ROOM_GROUP = "group"
ROOM_DIRECT = "direct"

MSG_TEXT = "text"
MSG_IMAGE = "image"
MSG_VIDEO = "video"
MSG_FILE = "file"
MSG_SYSTEM = "system"
MSG_SENT = "sent"
MSG_RECALLED = "recalled"

# 互动目标
TARGET_POST = "post"
TARGET_MEDIA = "media"
TARGET_COMMENT = "comment"

# 通知类型
NOTIFY_COMMENT = "comment"
NOTIFY_REPLY = "reply"
NOTIFY_LIKE = "like"
NOTIFY_FAVORITE = "favorite"
NOTIFY_MENTION = "mention"
NOTIFY_REVIEW = "review"
NOTIFY_SYSTEM = "system"

# 上传允许的类型（白名单）
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".heic", ".heif", ".avif"}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}
FILE_EXT = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".md",
    ".zip", ".rar", ".7z", ".mp3", ".wav", ".m4a", ".aac",
}

IMAGE_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/heic", "image/heif", "image/avif"}
VIDEO_MIME = {"video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/x-msvideo"}
