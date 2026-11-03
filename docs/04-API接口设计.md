# 04 · API 接口设计

## 1. 通用约定

- 基础路径：`https://api.example.com/api/v1`
- 编码：`application/json; charset=utf-8`；上传为 `multipart/form-data`
- 时间：ISO 8601 UTC，如 `2026-11-03T06:12:00Z`
- 分页：游标式 `?limit=20&before_id=<uuid>`；返回 `meta: { next_cursor, has_more }`
- 排序、筛选参数一律白名单校验（`sort=created_at|-created_at`）
- 幂等：写接口支持 `Idempotency-Key` 头（聊天消息必用 `client_id`）

### 1.1 统一响应

```json
// 成功
{ "data": { }, "meta": { "next_cursor": null, "has_more": false } }

// 失败
{ "error": { "code": "AUTH_TOKEN_EXPIRED", "message": "登录已过期", "details": null } }
```

### 1.2 HTTP 状态码

| 码 | 用途 |
| --- | --- |
| 200 / 201 / 204 | 正常 |
| 400 | 参数错误 `VALIDATION_ERROR` |
| 401 | 未登录/令牌失效 `AUTH_*` |
| 403 | 已登录无权限 `PERMISSION_DENIED` |
| 404 | 资源不存在 `NOT_FOUND` |
| 409 | 冲突（重复点赞、房间已存在、client_id 重复） |
| 413 | 文件过大 `FILE_TOO_LARGE` |
| 422 | 业务规则拒绝 `BUSINESS_RULE` |
| 429 | 限流 `RATE_LIMITED`（带 `Retry-After`） |
| 500 | 服务端错误 `INTERNAL_ERROR` |

### 1.3 鉴权

```
Authorization: Bearer <access_token>
```
公开接口标注 `[公开]`，其余默认需要登录；`[管理员]` 需 `admin` 及以上。

---

## 2. 接口清单总览

| 模块 | 前缀 | 主要接口 |
| --- | --- | --- |
| 认证 | `/auth` | 注册、登录、刷新、登出、找回密码 |
| 站点 | `/site` | 公开配置、公告 |
| 用户 | `/users` | 我的资料、改密、他人名片 |
| 村民 | `/villagers` | 列表、详情、增删改 |
| 家庭 | `/families` | 列表、详情、增删改 |
| 文章 | `/posts` | 列表、详情、发布、编辑、删除 |
| 相册 | `/albums` | 列表、详情、增删改 |
| 媒体 | `/media` | 列表、详情、上传、删除、批量 |
| 上传 | `/uploads` | 初始化、分片、完成 |
| 时间轴 | `/timeline` | 列表、增删改 |
| 互动 | `/comments` `/likes` `/favorites` | 列表、创建、删除 |
| 首页流 | `/feed` | 混合内容 |
| 搜索 | `/search` | 全文检索 |
| 聊天 | `/chat` | 房间、消息、成员 |
| 通知 | `/notifications` | 列表、已读 |
| 举报 | `/reports` | 提交、处理 |
| 管理 | `/admin` | 用户审核、配置、审计、导出 |
| 系统 | `/healthz` `/client-errors` | 健康检查、前端错误上报 |
| 实时 | `/ws` | WebSocket |

---

## 3. 认证 `/auth`

### POST `/auth/register` [公开]
```json
// req（invite_code 是否必填取决于 site.feature.reg_mode）
{ "email": "a@b.com", "phone": null, "password": "str0ng!Pass",
  "nickname": "王小明", "invite_code": "VILLAGE2026",
  "villager": { "name": "王小明", "family_id": "fam_xxx", "relation_to_head": "长孙" } }
// res 201（需审核）
{ "data": { "user_id": "u_9", "status": "pending", "auto_approved": false,
            "access_token": "...", "refresh_token": "...",
            "message": "注册成功，等待管理员审核" } }
// res 201（邀请码免审核 / auto_approve=true）
{ "data": { "user_id": "u_9", "status": "active", "auto_approved": true,
            "access_token": "...", "refresh_token": "...",
            "message": "注册成功" } }
```

**校验顺序与规则**

| 步 | 规则 | 失败错误码 |
| --- | --- | --- |
| 1 | `reg_mode=closed` 拒绝 | `REGISTER_CLOSED` (403) |
| 2 | `reg_mode=invite` 时 `invite_code` 必填 | `INVITE_REQUIRED` (422) |
| 3 | 邀请码存在、未过期、未禁用、`used_count < max_uses` | `INVITE_INVALID` (422) |
| 4 | 昵称 2~20 字、密码 ≥ 8 位且含字母与数字、邮箱/手机唯一 | `VALIDATION_ERROR` (400) / `ALREADY_EXISTS` (409) |
| 5 | 决定初始状态：邀请码 `auto_approve=1` 或 `feature.auto_approve=true` → `active`；否则 `pending` | — |
| 6 | 邀请码 `used_count +1`；同事务内建 `User` + 可选 `Villager` | — |
| 7 | 新用户一律进 `notifications`：给所有 admin 推一条「有新注册待审核」 | — |

> 注册成功即返回 token（`pending` 用户也能登录浏览），避免“注册完却被踢回登录页”的困惑；所有写接口在鉴权依赖处统一拦 `pending`，返回 `ACCOUNT_PENDING`。

### POST `/auth/login`
```json
{ "account": "a@b.com", "password": "..." }
// res
{ "data": { "access_token": "...", "expires_in": 1800,
            "refresh_token": "...", "user": { } } }
```
被禁用返回 403 `ACCOUNT_DISABLED`；连续失败 5 次锁定 15 分钟。

### POST `/auth/refresh`
`{ "refresh_token": "..." }` → 新的 access + refresh（轮换，旧的立即失效）。

### POST `/auth/logout`
`{ "refresh_token": "..." }` → 204。

### POST `/auth/password/forgot` · POST `/auth/password/reset`
邮件或手机验证码方案（v1 可先做"管理员重置"，接口预留）。

### GET `/auth/me`
返回当前用户 + 权限点数组 + 绑定的村民档案摘要。

---

## 4. 站点配置 `/site`

### GET `/site/config` [公开]
只返回 `is_public=1` 的配置，且结构化为对象：
```json
{ "data": {
  "site": { "title": "过溪畈 · 老村记忆", "subtitle": "过了溪，就是田畈。", "hero_images": [ ], "hero_slogan": "过溪畈",
            "founded_year": 0, "demolition_date": "2026", "footer_text": "…", "icp": "…" },
  "feature": { "guest_browse": true, "reg_mode": "open", "auto_approve": false,
               "comment_enabled": true, "download_original": true },
  "contact": { "admin_name": "管理员" }
} }
```

### GET `/site/announcement` [公开] → 最新公告（可空）

---

## 5. 村民 `/villagers`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/villagers` | 列表：`?family_id=&q=&generation=&page` |
| GET | `/villagers/{id}` | 名片详情（含家庭、亲属、照片、留言墙） |
| POST | `/villagers` | 新建（`editor`+） |
| PATCH | `/villagers/{id}` | 编辑（本人或 `editor`+） |
| DELETE | `/villagers/{id}` | 软删除（`admin`） |
| POST | `/villagers/{id}/avatar` | 上传肖像 |

详情响应示例：
```json
{ "data": {
  "id": "v_1", "name": "王德海", "alias": "老海", "gender": "male", "generation": "德",
  "birth_date": "1932", "death_date": "2008", "is_deceased": true,
  "occupation": "石匠", "intro": "…", "avatar_url": "…",
  "family": { "id": "f_1", "name": "王德海家", "door_no": "12号" },
  "relations": [ { "villager": {"id":"v_2","name":"李秀英"}, "relation": "spouse" } ],
  "photo_count": 37, "post_count": 4
} }
```
隐私：`contact` 字段按角色裁剪——`private` 仅本人与超管可见。

---

## 6. 家庭 `/families`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/families` | 列表，支持 `?area=&q=`，按 `sort_order` |
| GET | `/families/{id}` | 详情：成员（按辈分排序）、相册、故事 |
| POST/PATCH/DELETE | `/families[/{id}]` | `editor`+ / `admin` |

成员排序规则：`relation_to_head` 权重（本人 0 → 配偶 1 → 子女 2 → 孙 3）+ `birth_date`。

---

## 7. 文章与短文 `/posts`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/posts` | `?kind=article&category=&tag=&q=&author_id=&status=&limit=20&before_id=` |
| GET | `/posts/{id}` | 详情（`view_count` 异步 +1） |
| POST | `/posts` | 创建，`status` 由审核策略决定 |
| PATCH | `/posts/{id}` | 编辑（作者或 `content_manage`） |
| DELETE | `/posts/{id}` | 软删除 |
| POST | `/posts/{id}/pin` `/feature` | `admin` |
| GET | `/posts/mine/drafts` | 我的草稿 |

创建请求体：
```json
{ "kind": "article", "title": "打谷场上的夏天", "summary": "…",
  "content": { "type": "doc", "content": [ ] },   // Tiptap JSON
  "cover_url": "…", "category": "farming", "tags": ["麦收","打谷场"],
  "visibility": "public", "status": "published" }
```
短文：`kind=short`，`content` 为纯文本 JSON，`images` 存 media 的 url 数组（≤9）。

服务端处理：`content` JSON → 白名单清洗 → 生成 `content_html`（用于导出、OG 描述、邮件通知）。

---

## 8. 相册与媒体 `/albums` `/media`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/albums` | 列表（封面、数量、年代） |
| GET | `/albums/{id}` | 详情 + 首批 30 张 |
| GET | `/albums/{id}/media` | 分页媒体 |
| POST/PATCH/DELETE | `/albums[/{id}]` | `editor`+ |
| GET | `/media` | 全站照片流：`?kind=image&era=1980s&uploader_id=&sort=`
| GET | `/media/{id}` | 详情（含点赞/收藏状态 `is_liked`/`is_favorited`） |
| PATCH | `/media/{id}` | 改标题/说明/年代/关联村民 |
| DELETE | `/media/{id}` | `admin` 或上传者 |
| POST | `/media/batch` | 批量移动到相册 / 批量删除 |

媒体详情响应：
```json
{ "data": {
  "id": "m_1", "kind": "image", "title": "村口老槐树", "caption": "…",
  "status": "ready", "width": 3000, "height": 2000, "taken_at": "1985-06-01T00:00:00Z",
  "urls": { "thumb": "/media/derived/m_1/thumb.webp",
            "small": "…", "medium": "…", "original": "/api/v1/media/m_1/original" },
  "album": { "id": "a_1", "title": "老村印记" },
  "villagers": [ {"id": "v_1", "name": "王德海"} ],
  "like_count": 12, "is_liked": true, "is_favorited": false, "comment_count": 3,
  "uploader": { "id": "u_1", "nickname": "小明" }, "created_at": "…"
} }
```

### 上传三接口

**POST `/uploads/init`**
```json
// req
{ "kind": "image|video|file", "filename": "IMG_0001.HEIC",
  "size": 2839123, "mime": "image/heic", "chunk_size": 5242880, "album_id": "a_1" }
// res
{ "data": { "upload_id": "up_1", "chunks": 1,
            "upload_url": "/api/v1/uploads/up_1/chunk/{index}",
            "complete_url": "/api/v1/uploads/up_1/complete" } }
```

**PUT `/uploads/{upload_id}/chunk/{index}`** — `application/octet-stream`，返回 `{received, size}`

**POST `/uploads/{upload_id}/complete`**
```json
{ "data": { "media_id": "m_1", "status": "processing",
            "placeholder": "data:image/…", "estimated_seconds": 4 } }
```

**GET `/uploads/quota`** → `{ used_bytes, total_bytes, today_images, today_videos }`

---

## 9. 互动

### POST `/likes/toggle`
```json
{ "target_type": "post|media|comment", "target_id": "..." }
// res  { "data": { "liked": true, "like_count": 13 } }
```

### POST `/favorites/toggle`
同上结构，返回 `{ "favorited": true, "favorite_count": 8 }`。

### GET `/favorites/mine`
`?target_type=` 返回收藏列表（带目标摘要，便于卡片渲染）。

### GET `/comments`
`?target_type=post&target_id=...&limit=20&before_id=` → 一级评论 + 前 3 条回复。

### POST `/comments`
```json
{ "target_type": "media", "target_id": "m_1",
  "content": "这张照片里左边是我爸", "parent_id": null }
```
规则：命中敏感词 → `status=pending` 并返回"已提交审核"；触发通知给目标作者（非自己）。

### GET `/comments/replies/{root_id}` → 该楼全部回复（分页）

### DELETE `/comments/{id}` → 作者或 `content_manage`

---

## 10. 首页与搜索

### GET `/feed`
```json
{ "data": {
  "hero": { "slogan": "…", "images": ["…"] },
  "items": [
    { "type": "post",  "id": "p_1", "title": "…", "excerpt": "…", "cover": "…",
      "author": {...}, "stats": {"like": 3, "comment": 1}, "published_at": "…" },
    { "type": "media", "id": "m_1", "kind": "image", "urls": {...}, "taken_at": "1985" }
  ],
  "sidebars": { "recent_media": [...], "hot_albums": [...], "active_villagers": [...] }
}, "meta": { "next_cursor": "...", "has_more": true } }
```
实现：先查 `posts` 与 `media` 各 30 条，按时间合并取 20（内存合并，数据量小可接受）。

### GET `/search?q=&type=all|post|media|villager&limit=20`
返回分组结果；`q` 长度 ≥ 1，超 30 字符截断；限流 20 次/分钟。

---

## 11. 时间轴 `/timeline`

`GET /timeline?category=` → 按 `sort_year` 升序；`POST/PATCH/DELETE` 需 `editor`+；`POST /timeline/reorder` 批量排序。

---

## 12. 聊天 `/chat`

### REST

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/chat/rooms` | 我的房间列表（含未读数、最后一条消息） |
| POST | `/chat/rooms` | 创建群聊（`admin`）或私聊（自动按 `direct_key` 复用） |
| GET | `/chat/rooms/{id}` | 房间详情 + 成员 |
| PATCH | `/chat/rooms/{id}` | 改名称/头像/公告 |
| POST | `/chat/rooms/{id}/members` | 拉人 / 退群 |
| DELETE | `/chat/rooms/{id}` | 解散（`owner`/`admin`） |
| GET | `/chat/rooms/{id}/messages` | 历史 `?before_seq=&after_seq=&limit=50` |
| POST | `/chat/rooms/{id}/messages` | HTTP 兜底发送（WS 断线时） |
| POST | `/chat/messages/{id}/recall` | 2 分钟内或管理员 |
| DELETE | `/chat/messages/{id}` | 仅自己可见删除或管理员物理删除 |
| POST | `/chat/rooms/{id}/read` | `{ seq }` 更新已读 |
| GET | `/chat/unread` | 全局未读总数（Tab 角标） |

消息对象：
```json
{ "id": "msg_1", "room_id": "r_1", "seq": 128,
  "sender": { "id": "u_1", "nickname": "小明", "avatar_url": "…" },
  "kind": "image",
  "content": null,
  "attachment": { "id": "at_1", "url": "…", "thumb": "…", "width": 1280, "height": 960,
                  "filename": "老屋.jpg", "size": 233402 },
  "reply_to": { "id": "msg_120", "sender_name": "小芳", "excerpt": "…" },
  "status": "sent", "created_at": "…" }
```

创建私聊：`POST /chat/rooms { "type": "direct", "peer_user_id": "u_9" }` → 若已存在返回 200 同一房间。

### WebSocket `/ws`

```
连接：wss://api.example.com/ws?token=<access_token>
鉴权：握手时解析 token；无效则 close(4401)
心跳：客户端 25s 发 ping，60s 无消息服务端主动断
```

客户端事件
```json
{"type":"room.join","room_id":"r_1"}
{"type":"room.leave","room_id":"r_1"}
{"type":"message.send","client_id":"c-uuid","room_id":"r_1","kind":"text","content":"在吗"}
{"type":"message.send","client_id":"c-uuid","room_id":"r_1","kind":"image","attachment_id":"at_1"}
{"type":"message.read","room_id":"r_1","seq":128}
{"type":"typing","room_id":"r_1"}
```

服务端事件
```json
{"type":"ready","user_id":"u_1","server_time":"…"}
{"type":"message.new","room_id":"r_1","message":{ }}
{"type":"message.ack","client_id":"c-uuid","message_id":"msg_1","seq":128}
{"type":"message.read","room_id":"r_1","user_id":"u_2","seq":130}
{"type":"presence","room_id":"r_1","online":["u_1","u_2"]}
{"type":"notice","level":"warn","text":"你发送得太快了"}
{"type":"error","code":"RATE_LIMITED","message":"每分钟最多 20 条"}
```

服务端校验顺序：房间成员 → 禁言状态 → 敏感词（`level=3` 拒绝，`=2` 进审）→ 频率（20 条/分钟，超限 `notice`）→ 落库 → 广播。

---

## 13. 通知 `/notifications`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/notifications` | `?unread=true` 分页 |
| GET | `/notifications/unread-count` | `{ "total": 3 }` |
| POST | `/notifications/read` | `{ "ids": [...] }` / `{"all": true}` |

---

## 14. 举报 `/reports`

`POST /reports` `{ target_type, target_id, reason, detail }` → 201。
`GET /reports`（`admin`）、`POST /reports/{id}/resolve` `{ action: "hide|ignore|warn", note }`。

---

## 15. 管理后台 `/admin`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/admin/overview` | 指标：用户/内容/存储/活跃 |
| GET | `/admin/users` | `?status=pending&role=&q=` |
| POST | `/admin/users/batch-approve` | `{ "ids": [...] }` 批量通过 |
| POST | `/admin/users/{id}/approve` | 通过审核（可同时指定角色） |
| POST | `/admin/users/{id}/reject` | `{ reason }` |
| POST | `/admin/users/{id}/role` | `{ role }`（仅 super_admin） |
| POST | `/admin/users/{id}/disable` | 禁用 |
| POST | `/admin/users/{id}/reset-password` | 生成临时密码 |
| GET | `/admin/invites` / POST | 邀请码管理（`max_uses` / `expires_at` / `auto_approve` / `note`） |
| GET | `/admin/settings` | 全量配置（含私有项） |
| PATCH | `/admin/settings` | 批量更新 `[{key, value}]`，写审计 |
| POST | `/admin/settings/upload` | 上传 Hero/Logo 图 |
| GET | `/admin/comments` | 全站评论管理 |
| GET | `/admin/reports` | 举报队列 |
| GET | `/admin/sensitive-words` / POST / DELETE | 敏感词库 |
| GET | `/admin/audit-logs` | 审计日志 |
| GET | `/admin/storage` | 存储用量、TOP 上传者、孤儿文件数 |
| POST | `/admin/storage/gc` | 触发清理（只进 trash） |
| POST | `/admin/export` | 生成导出任务 → `{ job_id }` |
| GET | `/admin/export/{job_id}` | 进度 / 下载链接 |

---

## 16. 系统

- `GET /healthz` → `{ "status":"ok", "db":"ok", "disk_free_gb": 123.4, "queue": 2 }`
- `POST /client-errors` → 前端异常上报（采样、限流 30 次/分钟/IP）
- `GET /openapi.json` → 自动文档；生产环境 `docs` 仅内网/加 Basic Auth

---

## 17. 错误码表（节选）

| code | HTTP | 含义 |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | 参数校验失败，`details` 含字段级信息 |
| `AUTH_INVALID_CREDENTIALS` | 401 | 账号或密码错误 |
| `AUTH_TOKEN_EXPIRED` | 401 | access token 过期，前端应刷新 |
| `AUTH_REFRESH_INVALID` | 401 | refresh 失效，需重新登录 |
| `ACCOUNT_PENDING` | 403 | 审核中，仅可浏览 |
| `ACCOUNT_DISABLED` | 403 | 已禁用 |
| `REGISTER_CLOSED` | 403 | 站点已关闭注册 |
| `INVITE_REQUIRED` | 422 | 邀请制站点未填邀请码 |
| `INVITE_INVALID` | 422 | 邀请码无效/过期/已用完 |
| `PERMISSION_DENIED` | 403 | 无权限 |
| `NOT_FOUND` | 404 | 资源不存在或不可见 |
| `ALREADY_EXISTS` | 409 | 重复（点赞/收藏/私聊房间） |
| `FILE_TOO_LARGE` | 413 | 超限 |
| `FILE_TYPE_NOT_ALLOWED` | 422 | 类型不允许 |
| `QUOTA_EXCEEDED` | 422 | 用户配额用尽 |
| `RATE_LIMITED` | 429 | 限流 |
| `CONTENT_BLOCKED` | 422 | 命中敏感词 level 3 |
| `MUTED` | 403 | 被禁言 |

---

## 18. 前端调用示例（`web/src/api/client.ts`）

```ts
// 统一注入 token、401 静默刷新、错误提示
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeader(), ...init.headers },
  });
  if (res.status === 401 && (await tryRefresh())) return request<T>(path, init);
  const json = await res.json();
  if (!res.ok) throw new ApiError(json.error.code, json.error.message);
  return json.data as T;
}
```
