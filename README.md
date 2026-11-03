# 过溪畈 · 老村记忆（Village Memory）

> 浙江省衢州市柯城区白云街道过溪畈村（原姜家山乡，今属智慧新城片区）—— 2026 年启动拆迁，这是它的数字纪念空间。
> PC 站 + PWA 手机端 + 管理后台，照片视频、文章短文、村史时间轴、村民名片、村庄聊天室与私聊。

**村名**：村以畈名，畈中有翁梅溪穿越，故称过溪畈。村民的说法更简单——过了溪，就是一片田畈。

```
过溪畈（官庄畈 · 蓬上）
浙江省衢州市柯城区白云街道 · 杭金衢高速西出口沿线
314 户 / 728 人（区地名材料，待村委核实）
2026 年启动拆迁
```

---

## 1. 文档索引

| 序号 | 文档 | 内容 |
| --- | --- | --- |
| 00 | [README.md](./README.md) | 项目总览、目录规划、快速开始 |
| 01 | [docs/01-产品需求文档.md](./docs/01-产品需求文档.md) | 目标用户、功能清单、页面清单、优先级、非功能需求 |
| 02 | [docs/02-技术架构方案.md](./docs/02-技术架构方案.md) | 技术选型、系统架构、实时通信、文件处理、安全方案 |
| 03 | [docs/03-数据库设计.md](./docs/03-数据库设计.md) | ER 关系、建表 DDL、索引与迁移策略 |
| 04 | [docs/04-API接口设计.md](./docs/04-API接口设计.md) | RESTful + WebSocket 协议、错误码、鉴权约定 |
| 05 | [docs/05-前端与UI设计.md](./docs/05-前端与UI设计.md) | 前端工程结构、设计语言、组件体系、PWA 策略 |
| 06 | [docs/06-部署与运维方案.md](./docs/06-部署与运维方案.md) | Vercel 前端部署、Windows Server 后端部署、备份与监控 |
| 07 | [docs/07-开发计划与里程碑.md](./docs/07-开发计划与里程碑.md) | 分期计划、任务拆解、验收标准、风险登记表 |
| 08 | [docs/08-站点文案与视觉素材.md](./docs/08-站点文案与视觉素材.md) | 村史事实底稿、全站文案、传播物料、图片素材与生成提示词 |

---

## 2. 一句话技术方案

- **前端**：React 19 + TypeScript + Vite 7 + Tailwind CSS 4 + shadcn/ui + TanStack Query，构建产物托管 Vercel（GitHub 推送自动部署），通过 `vite-plugin-pwa` 生成可安装的 PWA。
- **后端**：FastAPI + SQLAlchemy 2.0 + Alembic + Pydantic v2 + WebSocket，原生 Windows 服务方式运行（NSSM + Uvicorn），前置 Caddy 反向代理自动签发 HTTPS。
- **数据库**：MVP 阶段 SQLite（WAL 模式，零运维），并发上来后可平滑迁移 PostgreSQL 16（SQLAlchemy 层无需改代码）。
- **文件存储**：本地磁盘 `D:\village-data\uploads`，图片自动转 WebP + 多尺寸缩略图，视频转 HLS 切片 + 首帧封面。
- **管理后台**：与前台同一 React 工程，独立路由 `/admin`，基于 RBAC 权限控制，不为后台单独维护第二套前端。

```
                    ┌──────────────────────────┐
   PC 浏览器 / PWA  →│  Vercel (React + Vite)   │
                    └───────────┬──────────────┘
                                │ HTTPS  /api  /ws
                    ┌───────────▼──────────────┐
                    │  Caddy 反向代理 (443)     │  自动证书
                    └───────────┬──────────────┘
                    ┌───────────▼──────────────┐
                    │  FastAPI (Windows 服务)   │
                    │  REST + WebSocket         │
                    └───┬───────────────┬──────┘
                        │               │
              ┌─────────▼──────┐  ┌─────▼─────────────┐
              │ SQLite / PG    │  │ D:\village-data   │
              │ 业务数据        │  │ 原图/切片/附件     │
              └────────────────┘  └───────────────────┘
```

---

## 3. 代码仓库规划

推荐 **单仓（monorepo）**，前后端同仓库、同一次提交联动，Vercel 侧配置 `Root Directory = web` 即可只部署前端。

```
guoxifan/
├── web/                          # React + Vite 前端（Vercel 部署目标）
│   ├── public/
│   │   ├── icons/                # PWA 图标 192/256/512 + apple-touch-icon
│   │   ├── assets/village/       # 预压缩村景 WebP（19 张，首屏兜底用）
│   │   └── icon.svg              # 站点图标（纸底 + 红印章「畈」）
│   ├── scripts/make-icons.py     # 图标生成脚本（Pillow，4 倍超采样）
│   ├── src/
│   │   ├── components/ui/        # Button / Form / Modal / Display / Toaster
│   │   ├── components/layout/    # SiteLayout / AdminLayout / SiteHeader / nav
│   │   ├── components/content/   # 照片墙、灯箱、发布、上传、评论、互动、村民与家庭表单
│   │   ├── lib/                  # api.ts（含 token 续期）、socket.ts、types.ts、utils.ts
│   │   ├── pages/                # 18 个前台页面
│   │   ├── pages/admin/          # 后台五个页面（懒加载）
│   │   ├── store/                # Zustand：登录态、Toast
│   │   ├── App.tsx / main.tsx / index.css
│   ├── index.html, vite.config.ts, vercel.json, .env.example, package.json
├── api/                          # FastAPI 后端
│   ├── app/
│   │   ├── main.py               # 入口：中间件、异常、静态媒体、/healthz
│   │   ├── core/                 # 配置、安全、依赖、错误、常量
│   │   ├── db/                   # session、base、建表
│   │   ├── models/               # SQLAlchemy ORM：user / content / village / chat / system
│   │   ├── schemas/              # Pydantic v2
│   │   ├── api/v1/               # auth / site / feed / content / village / interactions / chat / uploads / admin
│   │   ├── services/             # 媒体处理、审核、通知、统计、存储、定时维护
│   │   └── ws/                   # WebSocket 连接管理与广播
│   ├── scripts/                  # seed（演示数据）/ smoke（端到端冒烟）/ maintenance / optimize_village_assets
│   ├── alembic/
│   ├── media/                    # 本地开发存储
│   ├── pyproject.toml
│   └── .env.example
├── deploy/
│   ├── README.md                 # 部署手册（服务器、服务、计划任务、发布回滚）
│   ├── caddy/Caddyfile
│   └── windows/                  # install-service / update / backup / restore / healthcheck
└── docs/
```

### 3.1 文案与素材

- 全站文案、村史事实底稿、传播物料、图片提示词集中在 [08 文档](./docs/08-站点文案与视觉素材.md)。
- 图片素材：`docs/assets/village/`（PNG 原图）+ `docs/assets/village/web/`（WebP 1280/640），已复制到 `web/public/assets/village/`，首屏无数据时用它兜底。
- 重新压图：`cd api; python -m scripts.optimize_village_assets`。
- 重新生成 PWA 图标：`python web/scripts/make-icons.py`（需要 Pillow）。

---

## 4. 命名与术语约定

| 术语 | 含义 |
| --- | --- |
| Villager（村民） | 村庄人物档案，可无账号（用于录入已故长辈或不会用手机的老人） |
| User（账号） | 登录凭证，与 Villager 一对一绑定；管理员也是 User |
| Family（家庭） | 户，村民归属的家庭单元，带门牌/老宅位置 |
| Post（内容） | 统一内容表，`type` 区分 `article`（长文）/ `short`（短文） |
| Album / Media | 相册与相册内的照片/视频条目 |
| Room / Message | 聊天室（全村大厅/群聊/私聊）与消息 |
| Reaction | 点赞、收藏、评论的统称（多态关联到 Post/Media） |

---

## 5. 快速开始（本地开发）

后端（首次）：

```powershell
cd d:\python_projects\guoxifan\api
python -m venv ..\.venv
..\.venv\Scripts\python.exe -m pip install -e ".[dev]"
Copy-Item .env.example .env
..\.venv\Scripts\alembic.exe upgrade head
..\.venv\Scripts\python.exe -m scripts.seed --demo   # 可选：演示数据（4 户人家、10 位村民、7 条村史、4 个相册 8 张照片、1 篇文章 6 条短文）
```

后端（日常）：

```powershell
cd d:\python_projects\guoxifan\api
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
# http://127.0.0.1:8000/docs （生产会自动关闭）
```

前端：

```powershell
cd d:\python_projects\guoxifan\web
npm install
npm run dev      # http://localhost:5173，vite 已代理 /api、/media、/ws 到 127.0.0.1:8000
npm run build    # tsc -b + vite build，产出 dist/ 与 PWA 预缓存
```

默认管理员：首次启动时读取 `ADMIN_INIT_EMAIL` / `ADMIN_INIT_PASSWORD` 创建（默认 `admin@village.local` / `Village@2026`），登录后必须立刻改密。

`scripts.seed --demo` 还会建一位绑定了村民名片（张卫东）的普通账号 `villager@village.local` / `Village@2026`，用来演示「村民之间私聊」：用管理员打开该村民详情页能看到「私信」，点进去就是一对一房间。

> WebSocket 由 `uvicorn[standard]` 自带的 `websockets` 提供。若环境里只装了裸 `uvicorn`，聊天能发消息但收不到实时推送，也不会报错——升级时务必按 `pip install -e ".[dev]"` 安装。

自检与维护：

```powershell
# 端到端冒烟：注册 → 审核 → 发帖 → 上传 → 评论点赞 → 私聊 → 后台
cd api; ..\.venv\Scripts\python.exe -m scripts.smoke --base http://127.0.0.1:8000

# 计数校准 / 孤儿文件清理（分片暂存 + 孤儿派生图 + 孤儿原始文件）
..\.venv\Scripts\python.exe -m scripts.maintenance recount
..\.venv\Scripts\python.exe -m scripts.maintenance gc --days 7 --dry-run
```

上线部署见 [deploy/README.md](./deploy/README.md)。

---

## 6. 已确认的关键决策

| # | 决策 | 落地方式 |
| --- | --- | --- |
| D1 | 服务器带宽与磁盘已确认（满足视频托管要求） | 视频走本地存储 + HLS 切片，暂不引入对象存储；保留 OSS 迁移口子 |
| D2 | 域名会做 ICP 备案；备案期间前端先用海外免费平台部署 | 分两阶段上线，见 6.2 |
| D3 | 注册支持「自助注册 + 管理员审核」，同时支持邀请码 | 三档注册模式 + 审核开关，见 6.3 |

### 6.1 由此带来的设计影响

- 后端 `/uploads` 直接承接视频分片，`MAX_VIDEO_MB=500`、单用户配额 5GB 保持默认（D1）。
- 前端域名与 API 域名分别配置环境变量，**换域名不需要改代码**，只改 Vercel 环境变量 + DNS（D2）。
- 注册入口根据后端返回的 `site.feature.reg_mode` 动态渲染，前端不写死（D3）。

### 6.2 上线路径（D2）

| 阶段 | 前端 | 后端 | 域名 | 用途 |
| --- | --- | --- | --- | --- |
| A · 内测 | Vercel 默认域名 `village-memory.vercel.app` | Cloudflare Tunnel 临时暴露 `api`（免公网 IP、免备案） | 平台二级域名 | 家人内测，小范围访问 |
| B · 备案中 | 同上（或 Cloudflare Pages 作为备用节点） | Cloudflare Tunnel 或直连 IP + 端口 | 平台二级域名 | 继续试运行，不对外宣传 |
| C · 备案完成 | 绑定 `village.example.com`（Vercel） | Caddy 直连 `api.example.com` + 自动 HTTPS | 自有已备案域名 | 正式对外 |
| D · 可选 | 加速优化：国内 CDN 或同机房托管一份 | 不变 | 不变 | 老人访问更快 |

> 备案完成前**不要用未备案域名对外大规模宣传**，避免被拦截或影响备案。阶段 A/B 的详细配置见 [06 文档 §2.5](./docs/06-部署与运维方案.md)。

### 6.3 注册策略设计（D3）

`site.feature.reg_mode` 三档，后台可随时切换，无需重启：

| 模式 | 前台表现 | 审核 |
| --- | --- | --- |
| `open` 自助注册（默认） | 显示注册表单，邀请码一栏为「选填」 | 提交后 `pending`，管理员审核通过才可发布 |
| `invite` 邀请制 | 注册表单必须填邀请码 | 邀请码可标记「免审核」，否则同样进审核队列 |
| `closed` 关闭注册 | 隐藏注册入口，提示联系管理员 | 仅管理员后台建号 |

配套开关 `feature.auto_approve`（默认 `false`）：开启后所有新注册直接 `active`，仅用于完全信任的场景。

无论哪种模式，**新用户默认都是 `pending`**：可登录、可浏览，但不能上传、发布、发消息，页面顶部有明确的「审核中」提示条。

---

## 7. 验收清单

已自动化验证（可重复执行）：

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 后端端到端冒烟（70 项检查：注册审核、发帖、上传、评论点赞收藏、私聊、通知、搜索、后台、权限） | `python -m scripts.smoke` | 连续跑两次均全部通过（幂等，不改脏站点文案） |
| 前端类型与生产构建（`strict` + `noUnusedLocals`） | `cd web; npm run build` | 通过，主包 192.88 kB（gzip），后台与聊天页已拆包 |
| PWA 预缓存 | 同上 | 26 个文件 / 787 KiB |
| 健康检查字段（`status`/`db`/`disk_free_gb`） | `GET /healthz` | `{"status":"ok","db":"ok",…}` |
| WebSocket 实时链路 | 浏览器 / `websockets` 客户端连 `/ws?token=…` | 收到 `ready`，ping→pong，别的会话发消息无需刷新即到达 |
| 维护脚本 | `python -m scripts.maintenance recount` / `gc --dry-run` | 正常（计数校准、孤儿派生图、孤儿原始文件） |

上线后需人工过一遍（按角色各走一次）：

- [ ] 游客：首页 → 照片墙 → 单张放大 → 文章 → 短文 → 村史 → 村民名录 → 村民名片 → 各家各户 → 搜索
- [ ] 新注册用户：提示「审核中」，能浏览不能发布；管理员审核后立即可发
- [ ] 村民：发一篇长文 + 一条短文（含图）→ 上传照片到相册 → 点赞/收藏/评论 → 资料页改头像
- [ ] 聊天：两个账号在两个浏览器里互发文字/图片/文件，确认实时到达、未读数、已读
- [ ] 私聊：村民名片点「私信」→ 进入房间 → 对方收到通知（已故村民不显示私信入口）
- [ ] 后台：用户审核、内容审核、举报处理、敏感词、站点配置保存后前台生效、邀请码生成与停用
- [ ] 手机：添加到主屏幕（PWA），断网后已看过的相册仍可打开
- [ ] 运维：`/healthz` 正常、备份日志有当日记录、`restore.ps1 -DryRun` 能打印完整步骤

浏览器实测已覆盖：首页首屏与相册封面、登录（不再白屏）、后台概览、聊天实时收发、相册详情、村民名片与私信入口，截图存在 `docs/qa/`。

---

## 8. 已知边界

- 前端轻量编辑（直接写标题/正文/摘要），不支持 Markdown 与富文本编辑器；长文建议在本地写好再粘。
- 首页大图取自 `site.hero_images`；后台没配时回退到仓库里的 `web/public/assets/village/hero-01-panorama-1280.webp`。
- 已故村民的名片不提供私信入口。
- WebSocket 广播依赖单进程（uvicorn 单 worker），与 NSSM 单服务部署一致；扩到多进程前需要改用 Redis pub/sub。
- 弹幕、语音、视频通话不在本期范围；视频只做上传与 HLS 播放。
- 备案完成前，前端走平台二级域名、后端走临时隧道，不对外大规模宣传（见 6.2）。
