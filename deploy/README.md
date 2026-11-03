# 部署手册（Windows Server + Vercel）

对应 [docs/06-部署与运维方案.md](../docs/06-部署与运维方案.md)。所有路径默认按 06 文档：
代码 `D:\village\app`、虚拟环境 `D:\village\venv`、工具 `D:\village\tools`、日志 `D:\village\logs`、
数据 `D:\village-data`、备份 `E:\village-backup`。

```
deploy/
├── caddy/Caddyfile          # 反向代理 + 自动 HTTPS + 静态媒体直出
├── windows/install-service.ps1   # NSSM 注册 VillageAPI / Caddy（幂等）
├── windows/update.ps1            # 一键发布：拉代码 → 装依赖 → 迁移 → 重启 → 自检
├── windows/backup.ps1            # 每日 03:00 备份：快照 + 媒体镜像 + 周日打包
├── windows/restore.ps1           # 从备份恢复（支持 -DryRun 演练）
└── windows/healthcheck.ps1       # 每 5 分钟巡检，连续失败自动重启
```

---

## 1. 服务器准备

```powershell
# 目录骨架
New-Item -ItemType Directory -Force D:\village\app, D:\village\logs, D:\village\tools, D:\village-data, E:\village-backup
git clone <仓库地址> D:\village\app

# Python 3.12 + 虚拟环境
cd D:\village
python -m venv venv
D:\village\venv\Scripts\python.exe -m pip install -U pip
cd D:\village\app
D:\village\venv\Scripts\python.exe -m pip install -e api

# 工具：NSSM 与 Caddy 解压到 D:\village\tools\{nssm,caddy}
# FFmpeg 解压后把 ffmpeg.exe 目录填进 .env 的 FFMPEG_PATH
```

生产 `.env`（`D:\village\app\api\.env`，参考 `api/.env.example`）：

```ini
APP_ENV=production
SECRET_KEY=<python -c "import secrets;print(secrets.token_urlsafe(48))">
DATABASE_URL=sqlite+aiosqlite:///D:/village-data/village.db
MEDIA_ROOT=D:/village-data
PUBLIC_BASE_URL=https://api.example.com
CORS_ORIGINS=https://village.example.com,https://village-memory.vercel.app
ADMIN_INIT_EMAIL=<你的管理员邮箱>
ADMIN_INIT_PASSWORD=<首次启动密码，登录后立刻改>
FFMPEG_PATH=D:/village/tools/ffmpeg/bin/ffmpeg.exe
```

```powershell
# 数据库表
cd D:\village\app\api
D:\village\venv\Scripts\alembic.exe upgrade head
D:\village\venv\Scripts\python.exe -m scripts.seed --demo   # 可选：演示数据

# 确认 WebSocket 依赖在位（聊天实时推送靠它，缺了不会报错但收不到）
D:\village\venv\Scripts\python.exe -c "import websockets; print(websockets.__version__)"

# 收紧权限：.env 只给管理员与服务账号
icacls "D:\village\app\api\.env" /inheritance:r /grant "Administrators:F" /grant "village-svc:R"
```

> `APP_ENV=production` 时 FastAPI 自动关闭 `/docs` 与 `/openapi.json`（docs/06 §7）。
> `pip install -e api` 会按 `api/pyproject.toml` 装 `uvicorn[standard]`，其中包含 `websockets`；
> 若曾手工装过裸 `uvicorn`，请补装一次，否则聊天页收不到实时消息。

---

## 2. 注册服务

```powershell
cd D:\village\app\deploy\windows
.\install-service.ps1                      # 同时注册 VillageAPI 与 Caddy
.\install-service.ps1 -SkipCaddy           # 只装后端
```

脚本做的事：`nssm install VillageAPI <venv>\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers`，
设置 `AppDirectory`、`APP_ENV=production`、日志轮转（10MB）、崩溃重启、开机自启，最后请求 `/healthz` 自检。

Caddyfile 里先把 `api.example.com` 与邮箱改成真实值：

```powershell
caddy.exe validate --config D:\village\tools\caddy\Caddyfile
```

防火墙：

```powershell
New-NetFirewallRule -DisplayName "Village HTTP"  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow
New-NetFirewallRule -DisplayName "Village HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

---

## 3. 计划任务

```powershell
# 每日 03:00 备份
schtasks /Create /TN "VillageBackup" /SC DAILY /ST 03:00 /RU SYSTEM /F `
  /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\village\app\deploy\windows\backup.ps1"

# 每 5 分钟巡检（连续 3 次失败自动重启 VillageAPI）
schtasks /Create /TN "VillageHealth" /SC MINUTE /MO 5 /RU SYSTEM /F `
  /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\village\app\deploy\windows\healthcheck.ps1"

# 计数校准（每日 04:00）
schtasks /Create /TN "VillageRecount" /SC DAILY /ST 04:00 /RU SYSTEM /F `
  /TR "cmd /c cd /d D:\village\app\api && D:\village\venv\Scripts\python.exe -m scripts.maintenance recount"

# 孤儿文件清理（每周一 04:30）
schtasks /Create /TN "VillageGC" /SC WEEKLY /D MON /ST 04:30 /RU SYSTEM /F `
  /TR "cmd /c cd /d D:\village\app\api && D:\village\venv\Scripts\python.exe -m scripts.maintenance gc --days 7"
```

验证：`schtasks /Query /TN "VillageBackup" /V /FO LIST`，或直接手动跑一遍 `.\backup.ps1` 看 `E:\village-backup\backup.log`。

---

## 4. 发布与回滚

```powershell
# 后端：拉代码 → 备份 → 装依赖 → 迁移 → 重启 → 自检
cd D:\village\app\deploy\windows
.\update.ps1
```

- 工作区有未提交改动时脚本会直接中止，避免 `git reset --hard` 误伤。
- 迁移前会自动跑一次 `backup.ps1`。
- 健康检查失败时看 `D:\village\logs\api-err.log`；数据要回退就用 `restore.ps1`。

```powershell
# 恢复演练（不动文件，只打印步骤）
.\restore.ps1 -DryRun

# 真恢复：默认取最新快照，会二次确认
.\restore.ps1
.\restore.ps1 -Snapshot "E:\village-backup\db\village-20261103-0300.db" -Force
```

恢复流程：停服务 → 现库另存到 `E:\village-backup\pre-restore\` → 覆盖 `village.db`（清 `-wal`/`-shm`）→ robocopy 反向恢复媒体 → 起服务 → `/healthz` 自检。目标耗时 ≤ 4 小时（06 文档 §5.3），实际镜像恢复通常几分钟。

---

## 5. 前端（Vercel）

1. Vercel 项目 `Root Directory` 设为 `web`，框架自动识别 Vite（`web/vercel.json` 已配置 SPA 重写、缓存与安全响应头）。
2. 环境变量：

   | 键 | 值 |
   | --- | --- |
   | `VITE_API_BASE` | `https://api.example.com`（阶段 A/B 用 Cloudflare Tunnel 地址） |
   | `VITE_SITE_TITLE` | `过溪畈 · 老村记忆` |

3. 推送到 GitHub 即自动构建；本地先跑 `cd web; npm run build` 确认 `tsc -b` 与 PWA 预缓存都通过。
4. 域名切换只改 Vercel 环境变量 + DNS，同时在服务器 `.env` 的 `CORS_ORIGINS` 里补上新域名并 `Restart-Service VillageAPI`。

---

## 6. 排障速查

| 现象 | 先看 |
| --- | --- |
| 502 / 接口全挂 | `Get-Service VillageAPI`、`D:\village\logs\api-err.log` |
| 上传后图片 404 | `.env` 的 `MEDIA_ROOT` 是否为绝对路径；Caddy 的 `D:/village-data/derived` 是否存在 |
| 图片/视频能看但样式全丢 | Vercel 的 `VITE_API_BASE` 是否漏了 `https://` |
| 登录后立刻 401 | 服务器时间是否准确（JWT 对时间敏感） |
| 聊天不实时 | Caddy 的 `/ws` 是否带 `flush_interval -1`；浏览器控制台 WS 状态码 |
| 数据库锁报错 | 备份是否在业务高峰跑；`database is locked` 计数（06 文档 §6.3） |
| 磁盘告警 | `/healthz` 的 `disk_free_gb`，后台首页存储卡片 |
